import EventEmitter from 'eventemitter3'
import {
    createContext,
    type FC,
    type HTMLAttributes,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Public rejection class that signals the user cancelled the toast.
 */
export class ToastCancelled extends Error {
    constructor() {
        super('Toast cancelled by host')

        this.name = 'ToastCancelled'
    }
}

/**
 * Type guard for detecting ToastCancelled rejection.
 */
export function isCancelledByHost(e: unknown): e is ToastCancelled {
    return e instanceof ToastCancelled
}

// Internal signal used to trigger "soft" toast updates
const UpdateSignal = Symbol('UpdateSignal')

/**
 * Represents a deferred promise along with resolve/reject and settled state.
 */
export interface Deferral<T = void> {
    readonly resolve: (value: T) => void
    readonly reject: (reason?: unknown) => void
    readonly promise: Promise<T>
    readonly settled: boolean
}

/**
 * Creates a deferred promise with tracking for whether it has settled.
 */
export function defer<T = void>(): Deferral<T> {
    let settled = false

    let rs: Deferral<T>['resolve'] = () => {
        // This will get overwritten.
    }

    let rj: Deferral<T>['reject'] = () => {
        // This will get overwritten.
    }

    const promise = new Promise<T>((resolve, reject) => {
        rs = (value) => {
            if (!settled) {
                settled = true

                resolve(value)
            }
        }

        rj = (reason) => {
            if (!settled) {
                settled = true

                reject(reason)
            }
        }
    })

    return {
        resolve: rs,
        reject: rj,
        promise,
        get settled() {
            return settled
        },
    }
}

interface ToasterContainerProps extends HTMLAttributes<HTMLDivElement> {
    inline?: boolean
}

interface Metadata {
    component: FC<unknown>
    props: Record<never, never>
}

interface Key {
    value: number
}

interface DisposeDeferrals {
    disposeBegin: Deferral
    disposeFinish: Deferral
}

const DisposeDeferralsContext = createContext<DisposeDeferrals | undefined>(undefined)

/**
 * Hook for registering a disposal effect that runs before a toast is removed.
 * Supports async cleanup via `fn()` callback.
 */
export function useDisposeEffect(
    fn?: (dispose: () => void) => void | (() => void),
    deps: unknown[] = []
) {
    const deferrals = useContext(DisposeDeferralsContext)

    const [isDisposing, setIsDisposing] = useState(false)

    const fnRef = useRef(fn)

    if (fnRef.current !== fn) {
        fnRef.current = fn
    }

    const finish = deferrals?.disposeFinish.resolve

    const callback = useCallback(() => {
        if (!finish) {
            return
        }

        if (fnRef.current) {
            return fnRef.current(finish)
        }

        finish()
    }, [finish, ...deps])

    useEffect(() => {
        let mounted = true

        void (async () => {
            try {
                await deferrals?.disposeBegin.promise

                if (mounted) {
                    setIsDisposing(true)
                }
            } catch (_) {
                // Ignore.
            }
        })()

        return () => {
            mounted = false
        }
    }, [deferrals])

    useEffect(() => {
        if (isDisposing) {
            return callback()
        }
    }, [isDisposing, callback])
}

interface DisposableMetadata extends Metadata {
    deferrals: DisposeDeferrals
}

let lastToastableKey = 0

/**
 * Creates a toaster instance that renders toast components.
 * Manages internal state and cleanup lifecycle.
 */
export function toaster() {
    const emitter = new EventEmitter<'update'>()

    const items = new Map<Key, DisposableMetadata>()

    /**
     * Adds or updates a toast by key. Creates deferral lifecycle if new.
     */
    function set(key: Key, metadata: Metadata): void {
        const item = items.get(key)

        if (item) {
            items.set(key, {
                ...item,
                ...metadata,
            })
        } else {
            const deferrals = {
                disposeBegin: defer(),
                disposeFinish: defer(),
            }

            items.set(key, {
                ...metadata,
                deferrals,
            })

            void (async () => {
                try {
                    await Promise.allSettled([
                        deferrals.disposeBegin.promise,
                        deferrals.disposeFinish.promise,
                    ])

                    items.delete(key)

                    emitter.emit('update')
                } catch (_) {}
            })()
        }

        emitter.emit('update')
    }

    /**
     * Signals the toast to begin its async disposal process.
     */
    function dispose(key: Key): void {
        items.get(key)?.deferrals.disposeBegin.resolve()
    }

    return {
        /**
         * React component that renders all active toasts.
         * Can render inline or inside a portal.
         */
        Container({ inline = false, ...containerProps }: ToasterContainerProps): JSX.Element {
            const itemsRef = useRef(items)

            const emitterRef = useRef(emitter)

            const [container, setContainer] = useState<HTMLDivElement>()

            const [entries, setEntries] = useState<[key: Key, metadata: DisposableMetadata][]>([])

            useEffect(() => {
                function onUpdate() {
                    setEntries([...itemsRef.current.entries()])
                }

                onUpdate()

                const { current: emitter } = emitterRef

                emitter.on('update', onUpdate)

                return () => {
                    emitter.off('update', onUpdate)
                }
            }, [])

            useEffect(() => {
                if (inline) {
                    setContainer(undefined)

                    return () => {}
                }

                const div = document.createElement('div')

                div.className = 'hi_from_toasterhea'

                document.body.appendChild(div)

                setContainer(div)

                return () => {
                    document.body.removeChild(div)
                }
            }, [inline])

            if (inline) {
                return (
                    <div {...containerProps}>
                        {entries.map(([{ value: key }, { component: C, props, deferrals }]) => (
                            <DisposeDeferralsContext.Provider key={key} value={deferrals}>
                                <C {...props} />
                            </DisposeDeferralsContext.Provider>
                        ))}
                    </div>
                )
            }

            if (!container) {
                return <></>
            }

            return createPortal(
                <div {...containerProps}>
                    {entries.map(([{ value: key }, { component: C, props, deferrals }]) => (
                        <DisposeDeferralsContext.Provider key={key} value={deferrals}>
                            <C {...props} />
                        </DisposeDeferralsContext.Provider>
                    ))}
                </div>,
                container
            )
        },

        /**
         * Returns whether any toast is currently active (optionally filtered by component).
         */
        hasActive(component?: unknown): boolean {
            for (const item of items.values()) {
                if (component != null && item.component !== component) {
                    continue
                }

                if (!item.deferrals.disposeBegin.settled) {
                    return true
                }
            }

            return false
        },

        on(eventName: 'update', listener: () => void) {
            emitter.on(eventName, listener)
        },

        off(eventName: 'update', listener: () => void) {
            emitter.off(eventName, listener)
        },

        /**
         * Wraps a component into a toastable interface: `pop()` to show, `discard()` to cancel.
         */
        create<T>(component: T) {
            type Props = T extends FC<infer R> ? R : never

            type OwnProps = Prettify<Omit<Props, 'resolve' | 'reject'>>

            type ResolveType = Props extends { resolve: (...args: infer A) => void }
                ? [] extends A
                    ? void
                    : A extends [infer R, ...unknown[]]
                    ? R
                    : void
                : void

            type Args = IsStrictlyEmpty<OwnProps> extends true
                ? []
                : IsAllOptional<OwnProps> extends true
                ? [props?: OwnProps]
                : [props: OwnProps]

            let deferral: Deferral<ResolveType> | undefined

            let key: Key | undefined

            /**
             * Displays the component, returns a promise that resolves/rejects based on user interaction.
             */
            async function pop(...args: Args): Promise<ResolveType> {
                const [props = {}] = args

                deferral?.reject(UpdateSignal)

                deferral = defer()

                if (!key) {
                    lastToastableKey += 1

                    key = { value: lastToastableKey }
                }

                set(key, {
                    component: component as FC<unknown>,
                    props: {
                        ...props,
                        resolve: deferral.resolve,
                        reject: deferral.reject,
                    },
                })

                try {
                    while (1) {
                        try {
                            return await deferral.promise
                        } catch (e) {
                            if (e !== UpdateSignal) {
                                throw e
                            }
                        }
                    }
                } finally {
                    dispose(key)

                    key = undefined
                }

                throw 'The impossible happened… Quick, make a wish!'
            }

            /**
             * Cancels the toast explicitly by rejecting the promise with a ToastCancelled error.
             */
            function discard() {
                deferral?.reject(new ToastCancelled())
            }

            return {
                pop,
                discard,
            }
        },
    }
}

type Prettify<T> = {
    [K in keyof T]: T[K]
} & {}

type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]

type IsAllOptional<T> = RequiredKeys<T> extends never ? true : false

type IsStrictlyEmpty<T> = T extends object ? (keyof T extends never ? true : false) : false
