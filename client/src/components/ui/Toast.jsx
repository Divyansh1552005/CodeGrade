import { Toaster as HotToaster, ToastBar, toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

// react-hot-toast styled with the theme variables, so it follows light/dark automatically.
const toastStyle = {
  background: 'var(--raised)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-raised)',
  fontSize: '0.8125rem',
  maxWidth: '24rem',
};

export function Toaster() {
  return (
    <HotToaster
      position="bottom-right"
      toastOptions={{
        duration: 3500,
        style: toastStyle,
        success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--raised)' } },
        error: { iconTheme: { primary: 'var(--danger)', secondary: 'var(--raised)' } },
      }}
    >
      {(item) => (
        <ToastBar toast={item}>
          {({ icon, message }) => (
            <>
              {icon}
              <div className="min-w-0 flex-1">{message}</div>
              {item.type !== 'loading' && (
                <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss notification" onClick={() => toast.dismiss(item.id)}>
                  <Icon as={X} />
                </Button>
              )}
            </>
          )}
        </ToastBar>
      )}
    </HotToaster>
  );
}
