# toasterhea 🍞

Promises with UI.

## Installation

```bash
npm i toasterhea
```

### Peer dependencies

This package relies on the following dependencies:

```
eventemitter3 >= 4
react >= 16.8
react-dom >= 16.8
```

Make sure you have them installed, too!

## Usage

```tsx
import { toaster, toastify } from 'toasterhea'

function App() {
    return <>
        <button
            type="button"
            onClick={async () => {
                try {
                    if (await confirm()) {
                        // Do something!
                    }
                } catch (_) {}
            }}
        >
            Do this and that
        </button>
        <Popup.Component />
    </>
}

function ConfirmationPopup({
    message = 'What say you?',
    resolve
}: { message?: string, resolve(value: boolean): void }) {
    return <div>
        {message}
        <button type="button" onClick={() => { resolve(false) }}>
            Nah, I'd rather go back…
        </button>
        <button type="button" onClick={() => { resolve(true) }}>
            Proceed!
        </button>
    </div>
}

const Popup = toaster()

const confirm = toastify(ConfirmationPopup, Popup).pop
```

With this

- `confirm` can be used anywhere now, even outside of the react code.
- You can use such components to block flow (`pop` is asynchronous).

### Use cases

- Modal dialogs
- Popups of any sort (like dropdowns or drawers)
- Toast, alerts, info boxes

### No styling and pre-crisped out-of-the-box toastables? It's bs!

No?! There's no styling involved to keep your hands free to do as your heart desires! Anything you'd like to "toast" you build yourself. `toasterhea` is just the engine and it's good. You wouldn't like my styles anyways.
