import { useStore } from '@nanostores/react';
import { DeployButton } from '~/components/deploy/DeployButton';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';

type Tab = 'chat' | 'code' | 'preview';

interface TabDefinition {
  id: Tab;
  label: string;
  icon: string;
}

const TABS: TabDefinition[] = [
  { id: 'chat', label: 'Chat', icon: 'i-ph:chat-circle-text' },
  { id: 'code', label: 'Code', icon: 'i-ph:code' },
  { id: 'preview', label: 'Preview', icon: 'i-ph:eye' },
];

/**
 * Bottom navigation for phones: Chat / Code / Preview plus the Deploy menu.
 * Hidden from `md` up, where the regular side-by-side layout is used.
 */
export function MobileTabBar() {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const currentView = useStore(workbenchStore.currentView);

  const active: Tab = !showWorkbench ? 'chat' : currentView === 'preview' ? 'preview' : 'code';

  const select = (tab: Tab) => {
    if (tab === 'chat') {
      workbenchStore.showWorkbench.set(false);
      return;
    }

    workbenchStore.showWorkbench.set(true);
    workbenchStore.selectWorkbenchView(tab, { userInitiated: true });
  };

  return (
    <nav
      aria-label="Project navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-around gap-1 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => select(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
          className={classNames(
            'flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-xs transition-colors',
            active === tab.id
              ? 'text-bolt-elements-item-contentAccent'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          )}
        >
          <span className={classNames(tab.icon, 'text-xl')} aria-hidden="true" />
          {tab.label}
        </button>
      ))}
      <div className="flex flex-1 items-center justify-center">
        <DeployButton />
      </div>
    </nav>
  );
}
