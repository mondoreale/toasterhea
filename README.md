# toasterhea 🍞

Promises with UI.


## About

**toasterhea** lets you render React components as toast-like UI elements that behave like Promises.

This makes it easy to implement async flows such as modals, confirmation dialogs, or multi-step wizards — all using your own components and styling.

---

## Why

React doesn’t have a built-in way to tie UI directly to promise resolution. If you want something like:

```ts
const confirmed = await confirmDialog("Are you sure?")
```

...you’re left building your own state machine. `toasterhea` handles that for you, using components as promise interfaces.

---

## Installation

```bash
npm install toasterhea
```

---

## Example

```tsx
import { toaster, toastify } from 'toasterhea'

// Step 1: Create a component that accepts resolve/reject
function Confirm({ resolve }: { resolve: (value: boolean) => void }) {
    return (
        <div className="toast">
            <p>Are you sure?</p>
            <button
                onClick={() => {
                    resolve(true)
                }}
            >
                Yes
            </button>
            <button
                onClick={() => {
                    resolve(false)
                }}
            >
                Cancel
            </button>
        </div>
    )
}

// Step 2: Wrap it with toastify
const confirm = toastify(Confirm, toaster()).pop

// Step 3: Use it like a promise. Anywhere!
const result = await confirm()
```

---

## Rendering

Render the toast container in your app:

```tsx
const Foo = toaster()

function App() {
    return (
        <>
            <Foo.Container />
        </>
    )
}
```

The container supports `inline` rendering:

```tsx
<Foo.Container inline />
```

---

## Toast Component Requirements

Your toastable component must:

- Be a function component
- Accept `resolve(value?)` and/or `reject(reason?)` props
- Call one of them to settle

Additional props can be passed through `.pop(props)`.

```tsx
function ExampleToast({
    resolve,
    reject,
    name,
}: {
    resolve: (result: string) => void
    reject: () => void
    name: string
}) {
    /* ... */
}
```

---

## API

### `toaster()`

Creates a new toaster instance.

```ts
const t = toaster()
```

Returns:

- `Container`: React component to render active toasts
- `set()`: (internal) programmatically control state
- `dispose()`: (internal) begin async cleanup
- `on()`, `off()`: listen to update events
- `hasActive(component?)`: check if any toast is active

---

### `toastify(component, toaster)`

Wraps a component and returns `{ pop, discard }`:

- `pop(props?)`: shows the component and returns a promise
- `discard()`: programmatically cancel the toast

The props passed to `pop()` will be merged with `{ resolve, reject }`.

---

### `useDisposeEffect`

Allows components to delay disposal for animation or async work:

```tsx
useDisposeEffect((finish) => {
    animateOut().then(finish)
})
```

Must call `finish()` when done.

---

### `ToastCancelled`

An error class representing user cancellation. Useful for flow control.

```ts
import { isToastCancelled } from 'toasterhea'

try {
    await toast.pop()
} catch (e) {
    if (isToastCancelled(e)) {
        // user cancelled
    }
}
```

---

## Wizard Pattern Example

Chain multiple steps:

```tsx
const { pop: getName } = toastify(NameStep, t)
const { pop: getAvatar } = toastify(AvatarStep, t)

try {
    const name = await getName()
    const avatar = await getAvatar()
    // done
} catch (e) {
    if (isToastCancelled(e)) {
        // user bailed
    }
}
```

---

## License

MIT. Use responsibly. Don’t forget to resolve your promises.
