import { useEffect } from 'react';

/**
 * Single centered form on a plain background.
 *
 * Planned additions slot in without moving anything that is already on screen:
 *  - `providers`: buttons such as "Continue with Google". Rendered above the form with an "or" divider.
 *  - AuthChallenge: wrap a bot-check widget (Turnstile) placed inside the form, above the submit button.
 *    It reserves the widget's height so the button does not jump when the widget loads.
 */
export default function AuthCard({ title, subtitle, providers, footer, children }) {
  useEffect(() => { document.title = `${title} - CodeGrade`; }, [title]);
  return (
    <div className="mx-auto w-full max-w-sm pt-4 sm:pt-16">
      <h1 className="text-lg font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-base text-fg-muted">{subtitle}</p>}
      {providers && (
        <>
          <div className="mt-6 space-y-2">{providers}</div>
          <div className="my-6 flex items-center gap-3 text-sm text-fg-muted" role="separator">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <div className={providers ? '' : 'mt-6'}>{children}</div>
      {footer && <p className="mt-6 text-base text-fg-muted">{footer}</p>}
    </div>
  );
}

/** Reserves the height of a bot-check widget (about 65px) so loading it causes no layout shift. */
export function AuthChallenge({ children }) {
  return <div className="min-h-16">{children}</div>;
}
