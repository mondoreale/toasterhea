# toasterhea 🍞

Promise-driven toast-poppin' library.

## Installation

```bash
npm i toasterhea
```

### Peer dependencies

This package relies on the following dependencies:

```
eventemitter3 >= 4
lodash >= 0.1.0
react >= 16.8 <= 18
react-dom >= 16.8 <= 18
```

Make sure you have them installed, too!

## Key elements

### `Container(props: { id: string } & …): JSX.Element`

It's a React component responsible for rendering toastables.

```tsx
import { Container } from 'toasterhea'

function App() {
  return (
    <>
      {/* …codecodecode… */}
      <Container id="FOO" />
      {/* …codecodecode… */}
    </>
  )
}
```

### `useDiscardableEffect(fn?: (discard: () => void | Promise<void>) => void): void`

It's a React hook responsible for letting the `Container` know when exacly a toastable can be discarded. Everything you turn into a toast will have to utilize this hook.

Note that although the use of this hook is necessary, the callback is optional. If the callback isn't defined, the library will discard a toastable immediately after its promise is settled.

```tsx
import { useDiscardableEffect } from 'toasterhea'

interface Props {
  onResolve?: () => void
}

function FooToThePowerOfBar({ onResolve }: Props) {
  useDiscardableEffect((discard) => {
    // Discard the component after 10s.
    setTimeout(() => void discard(), 10000)
  })

  return (
    <button
      type="button"
      onClick={() => {
        /**
         * Calling `onResolve` resolves the underlying promise. The component will remain
         * mounted for another 10s (see above). UIs can be disabled here, and/or
         * animations triggered.
         */
        onResolve?.()
      }}
    >
      Let's go!
    </button>
  )
}
```

### `toaster<T>(component: T, containerId: string): Toaster<T>`

It turns components into toastables returns two methods:
1. `async pop(props?: ComponentProps<T>)` – displays the component using given `props`, and
2. `discard()` which rejects the internal promise.

```js
import { toaster, Toaster } from 'toasterhea'

function MasterOfAllFoos() {
  const fooRef = useRef(toaster(FooToThePowerOfBar, "FOO"))

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          try {
            await fooRef.current.pop()
          } catch (e) {
            /**
             * `FooToThePowerOfBar` does not reject explicitly. There's no UI for it. Few
             * things can cause a rejection, still, though. See `Reason` section for details.
             */
            console.warn('…and then this happened!', e)
          }
        }}
      >
        Let's foo that bar!
      </button>
      <button
        type="button"
        onClick={() => void fooRef.current.discard()}
      >
        Nah
      </button>
    </>
  )
}
```

### `Reason`

Some rejection scenarios are predefined and either are used internally or can be used from the outside to control the flow.

#### `Reason.Update`

Happens when the user calls `pop` on a toast that's already "popped" (got displayed). Any piece of code waiting for the previous call to `pop` will receive a rejection.

#### `Reason.Unmount`

Happens when the `Container` itself gets unmounted. The library rejects all outstanding promises and removes their associated DOM elements.

#### `Reason.Host`

Happens when `Toaster<T>.discard()` is called.

An example of how you can utilize them is shown below.

```js
import { Reason } from 'toasterhea'

try {
  // pop!
} catch (e) {
  switch (e) {
    case Reason.Update:
      console.info('Your toastable got updated!')
      break
    case Reason.Unmount:
      console.info('Your toastable got unmounted along with the entire `Container`.')
      break
    case Reason.Host:
      console.info('Your toastable got interrupted from the outside (someone called its `discard`).')
      break
    default:
      throw e
  }
}
```

And, naturally, you can define and use your own rejection reasons.

## Examples

### Toast

### Alert

### Modal dialog
