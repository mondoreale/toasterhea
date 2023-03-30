# toasterhea 🍞

Promise-driven toast-poppin' library.

## Installation

```bash
npm i toasterhea eventemitter3 lodash
```

## Key elements

### `Container(props: { id: string } & …): JSX.Element`

It's a React component responsible for rendering toastables.

```js
import { Container } from 'toasterhea'
```

### `useDiscardableEffect(fn?: (discard: () => void | Promise<void>) => void): void`

It's a React hook responsible for letting the `Container` know when exacly a toastable can be discarded. Everything you turn into a toast will have to utilize this hook.

Note that although the use of this hook is necessary, the callback is optional. If the callback isn't defined, the library will discard a toastable immediately after its promise is settled.

```js
import { useDiscardableEffect } from 'toasterhea'
```

### `toaster<T>(component: T, containerId: string): Toaster<T>`

It turns components into toastables returns two methods:
1. `async pop(props?: ComponentProps<T>)` – displays the component using given `props`, and
2. `discard()` which rejects the internal promise.

```js
import { toaster, Toaster } from 'toasterhea'
```

### `Reason`

Some rejection scenarios are predefined and either are used internally or can be used from the outside to control the flow.

- `Reason.Update`

  Happens when the user calls `pop` on a toast that's already "popped" (got displayed). Any piece of code waiting for the previous call to `pop` will receive a rejection.

- `Reason.Unmount`

  Happens when the `Container` itself gets unmounted. The library rejects all outstanding promises and removes their associated DOM elements.

- `Reason.Host`

  Happens when `Toaster<T>.discard` is called.

```js
import { Reason } from 'toasterhea'
```

## Examples

TODO
