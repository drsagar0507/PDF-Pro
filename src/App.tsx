import { Toaster } from 'react-hot-toast';
import { useUiStore } from './store/useUiStore';
import Home from './routes/Home';
import Editor from './routes/Editor';

function App() {
  const screen = useUiStore((s) => s.screen);

  return (
    <div className="h-full w-full bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Toaster position="bottom-center" toastOptions={{ duration: 2600 }} />
      {screen === 'home' ? <Home /> : <Editor />}
    </div>
  );
}

export default App;
