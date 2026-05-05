import { useParams } from 'react-router-dom';

// Placeholder. Commit 4 wires up edit form, contacts list, and
// activity feed. Commit 5 adds the log-activity form.
export default function Organization() {
  const { id } = useParams();
  return (
    <div className="min-h-full pt-[58px] pb-12 px-6">
      <div className="max-w-6xl mx-auto py-8">
        <h1 className="font-display text-4xl text-text mb-2">Organization detail</h1>
        <p className="text-text-dim font-mono text-xs uppercase tracking-[0.12em]">
          ID: {id} · Detail page coming in the next commit.
        </p>
      </div>
    </div>
  );
}
