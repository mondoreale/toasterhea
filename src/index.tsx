import EventEmitter from 'eventemitter3'
import uniqueId from 'lodash/uniqueId'
import {
    ComponentProps,
    createContext,
    FC,
    HTMLAttributes,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { createPortal } from 'react-dom'

export interface Deferral<T = void, R = unknown> {
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: R) => void
    promise: Promise<T>
}

export function defer<T = void, R = unknown>(): Deferral<T, R> {
    let resolve: (value: T | PromiseLike<T>) => void = () => {
        // This will get overwritten.
    }

    let reject: (reason?: R) => void = () => {
        // This will get overwritten.
    }

    const promise = new Promise<T>((...args) => void ([resolve, reject] = args))

    return {
        promise,
        resolve,
        reject,
    }
}

export const Reason = {
    Update: Symbol('update'),
    Unmount: Symbol('unmount'),
    Host: Symbol('host'),
}

function eventName(containerId: string) {
    return `toasterhea:${containerId}`
}

const DiscardableContext = createContext<[() => void, Promise<unknown>]>([
    () => {
        // Do nothing
    },
    Promise.resolve(),
])

export function useDiscardableEffect(fn?: (discard: () => void | Promise<void>) => void) {
    const fnRef = useRef(fn)

    useEffect(() => {
        fnRef.current = fn
    }, [fn])

    const [discard, promise] = useContext(DiscardableContext)

    useEffect(() => {
        let mounted = true

        async function innerFn() {
            try {
                await promise
            } catch (e) {
                if (e === Reason.Update) {
                    return
                }
            }

            if (!mounted) {
                return
            }

            if (fnRef.current) {
                return void fnRef.current(discard)
            }

            discard()
        }

        innerFn()

        return () => {
            mounted = false
        }
    }, [discard, promise])
}

interface Metadata<P extends FC = FC<any>> {
    id: string
    props?: ComponentProps<P>
    component: P
    deferral: Deferral<
        SettlerReturnValue<P, 'onResolve'>,
        SettlerReturnValue<P, 'onReject'> | typeof Reason.Update
    >
    discardDeferral: Deferral
}

let emitter: EventEmitter | undefined

function getEmitter(): EventEmitter {
    if (!emitter) {
        emitter = new EventEmitter()
    }

    return emitter
}

interface ContainerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'children'> {
    id: string
}

export function InlineContainer({ id: idProp, ...props }: ContainerProps) {
    const [metadatas, setMetadatas] = useState<Record<string, Metadata>>({})

    const id = useMemo(() => uniqueId(idProp), [idProp])

    useEffect(() => {
        let mounted = true

        let cache: typeof metadatas = {}

        async function onEvent(metadata: Metadata) {
            if (!mounted) {
                return
            }

            setMetadatas((all) => ({
                ...all,
                [metadata.id]: metadata,
            }))

            cache[metadata.id] = metadata

            try {
                await metadata.deferral.promise
            } catch (e) {
                if (e === Reason.Update) {
                    return
                }
            }

            try {
                await metadata.discardDeferral.promise
            } catch (e) {
                // Do nothing.
            }

            if (!mounted) {
                return
            }

            setMetadatas(({ [metadata.id]: omit, ...newMetadatas }) => newMetadatas)

            delete cache[metadata.id]
        }

        const en = eventName(idProp)

        getEmitter().on(en, onEvent)

        return () => {
            mounted = false

            getEmitter().off(en, onEvent)

            for (const key in cache) {
                if (!Object.prototype.hasOwnProperty.call(cache, key)) {
                    continue
                }

                cache[key].deferral.reject(Reason.Unmount)

                cache[key].discardDeferral.reject()
            }

            cache = {}
        }
    }, [idProp])

    return (
        <div {...props} id={id}>
            {Object.entries(metadatas).map(
                ([
                    key,
                    {
                        component: C,
                        props: innerProps,
                        deferral: { resolve, reject, promise },
                        discardDeferral: { resolve: discard },
                    },
                ]) => {
                    const { onResolve: omit0, onReject: omit1, ...rest } = (innerProps || {}) as any

                    return (
                        <DiscardableContext.Provider key={key} value={[discard, promise]}>
                            <C {...rest} onResolve={resolve} onReject={reject} />
                        </DiscardableContext.Provider>
                    )
                }
            )}
        </div>
    )
}

export function Container(props: ContainerProps) {
    const containerRef = useRef(
        typeof document === 'undefined' ? undefined : document.createElement('div')
    )

    useEffect(() => {
        const { current: container } = containerRef

        if (!container) {
            return () => void 0
        }

        document.body.appendChild(container)

        return () => {
            document.body.removeChild(container)
        }
    }, [])

    if (containerRef.current) {
        return createPortal(<InlineContainer {...props} />, containerRef.current)
    }

    return null
}

type SettlerReturnValue<
    T extends FC,
    K extends 'onResolve' | 'onReject'
> = ComponentProps<T> extends Partial<Record<K, (value: infer R) => void>> ? R : void

export interface Toaster<T extends FC<any>> {
    pop: (props?: ComponentProps<T>) => Promise<SettlerReturnValue<T, 'onResolve'>>
    discard: () => void
}

export function toaster<T extends FC<any>>(component: T, id: string): Toaster<T> {
    let metadata: Metadata<T> | undefined

    return {
        async pop(props) {
            if (metadata) {
                try {
                    metadata.deferral.reject(Reason.Update)

                    await metadata.deferral.promise
                } catch (e) {
                    // Do nothing.
                }
            }

            metadata = {
                id: metadata?.id || uniqueId(),
                props,
                component,
                deferral: defer(),
                discardDeferral: defer(),
            }

            getEmitter().emit(eventName(id), metadata)

            let reset = false

            try {
                const result = (await metadata.deferral.promise) as SettlerReturnValue<
                    T,
                    'onResolve'
                >

                props?.onResolve?.(result)

                reset = true

                return result
            } catch (e) {
                props?.onReject?.(e)

                reset = e !== Reason.Update

                throw e
            } finally {
                if (reset) {
                    metadata = undefined
                }
            }
        },
        discard() {
            metadata?.deferral.reject(Reason.Host)
        },
    }
}
