import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, Info } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { buildOutputPdf } from '../../lib/exportPdf';
import { protectPdf } from '../../lib/pdfEncrypt';
import { downloadBytes, suggestOutputName } from '../../lib/fileIO';

export default function ProtectPanel() {
  const sources = useDocStore((s) => s.sources);
  const pages = useDocStore((s) => s.pages);
  const annotations = useDocStore((s) => s.annotations);
  const formValues = useDocStore((s) => s.formValues);
  const fileName = useDocStore((s) => s.fileName);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (pages.length === 0) {
      toast.error('Open a PDF first');
      return;
    }
    if (password.length < 4) {
      toast.error('Use a password of at least 4 characters');
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const plain = await buildOutputPdf({ sources, pages, annotations, formValues });
      const protectedBytes = await protectPdf(plain, {
        userPassword: password,
        allowPrinting,
        allowCopying,
      });
      downloadBytes(protectedBytes, suggestOutputName(fileName, '-protected'));
      toast.success('Password-protected PDF downloaded');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Could not protect this PDF');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
          <ShieldCheck size={28} className="flex-none" />
          <p>
            Encrypts with AES-256 (the same standard security handler modern Acrobat uses). The file
            will require this password to open in any PDF reader. Verified automatically before download.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Enter a password" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Confirm password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" placeholder="Re-enter the password" />
        </label>

        <div className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowPrinting} onChange={(e) => setAllowPrinting(e.target.checked)} />
            Allow printing
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowCopying} onChange={(e) => setAllowCopying(e.target.checked)} />
            Allow copying text &amp; images
          </label>
        </div>

        <div className="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <Info size={26} className="flex-none" />
          <p>Don't forget this password — it can't be recovered. Nothing here is uploaded anywhere; encryption happens on your device.</p>
        </div>

        <button
          onClick={apply}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Encrypt &amp; download
        </button>
      </div>
    </div>
  );
}
