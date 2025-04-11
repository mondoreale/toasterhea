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

export const RejectionReason = {
    Update: Symbol('update'),
    Unmount: Symbol('unmount'),
    Host: Symbol('host'),
}

export interface Deferral<T = void> {
    resolve(value: T): void
    reject(reason?: unknown): void
    promise: Promise<T>
}

export function defer<T = void>(): Deferral<T> {
    let rs: Deferral<T>['resolve'] = () => {
        // This will get overwritten.
    }

    let rj: Deferral<T>['reject'] = () => {
        // This will get overwritten.
    }

    const promise = new Promise<T>((resolve, reject) => {
        rs = resolve

        rj = reject
    })

    return { resolve: rs, reject: rj, promise }
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

export function useDisposableEffect(
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

            deferrals?.disposeBegin.reject()

            deferrals?.disposeFinish.reject()
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

interface ToasterDisposeOptions {
    immediate?: boolean
}

interface Toaster {
    readonly Container: (props: ToasterContainerProps) => JSX.Element
    readonly set: (key: Key, metadata: Metadata) => void
    readonly dispose: (key: Key, options?: ToasterDisposeOptions) => void
}

export function toaster(): Toaster {
    const emitter = new EventEmitter<'update'>()

    const items = new Map<Key, DisposableMetadata>()

    return {
        set(key, metadata) {
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
                    } finally {
                        items.delete(key)

                        emitter.emit('update')
                    }
                })()
            }

            emitter.emit('update')
        },

        dispose(key, options = {}) {
            items.get(key)?.deferrals.disposeBegin.resolve()

            if (options.immediate) {
                items.get(key)?.deferrals.disposeFinish.resolve()
            }
        },

        Container({ inline = false, ...containerProps }) {
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
    }
}

let lastToastableKey = 0

export function toastify<T>(component: T, toaster: Toaster) {
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

    async function pop(...args: Args): Promise<ResolveType> {
        const [props = {}] = args

        deferral?.reject(RejectionReason.Update)

        deferral = defer()

        if (!key) {
            lastToastableKey += 1

            key = { value: lastToastableKey }
        }

        toaster.set(key, {
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
                    if (e !== RejectionReason.Update) {
                        throw e
                    }
                }
            }
        } finally {
            toaster.dispose(key)

            key = undefined
        }

        throw 'The impossible happened… Quick, make a wish!'
    }

    function discard() {
        deferral?.reject(RejectionReason.Host)
    }

    return {
        pop,
        discard,
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
