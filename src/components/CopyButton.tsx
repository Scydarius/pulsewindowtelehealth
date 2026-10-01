import React, { useState } from 'react';
import { Check, Copy, LoaderCircle } from 'lucide-react';

export interface CopyButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  text?: string;
  getText?: () => Promise<string> | string;
  label?: string;
  copiedLabel?: string;
  loadingLabel?: string;
  iconSize?: number;
  onCopied?: () => void;
}

/**
 * Universal copy button that provides high-visibility feedback with a smooth,
 * professional transition, pop animation, and cross-browser clipboard fallback.
 */
export function CopyButton({
  text,
  getText,
  label = 'Copy link',
  copiedLabel = 'Copied!',
  loadingLabel = 'Copying…',
  iconSize = 16,
  className = 'button button-secondary',
  onClick,
  onCopied,
  disabled,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (copied || loading) return;

    let targetText = text;
    if (!targetText && getText) {
      setLoading(true);
      try {
        targetText = await getText();
      } catch {
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (!targetText) return;

    let succeeded = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(targetText);
        succeeded = true;
      }
    } catch {
      succeeded = false;
    }

    if (!succeeded) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = targetText;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        succeeded = document.execCommand('copy');
        textarea.remove();
      } catch {
        succeeded = false;
      }
    }

    if (succeeded) {
      setCopied(true);
      onCopied?.();
      setTimeout(() => {
        setCopied(false);
      }, 2400);
    }
  };

  const displayText = copied ? copiedLabel : loading ? loadingLabel : label;

  return (
    <button
      type="button"
      className={`copy-btn ${className} ${copied ? 'copy-btn-copied' : ''} ${loading ? 'copy-btn-loading' : ''}`}
      onClick={(e) => void handleCopy(e)}
      aria-label={displayText}
      title={displayText}
      disabled={disabled || loading}
      {...rest}
    >
      <span className="copy-btn-icon-wrap" aria-hidden="true">
        {loading ? (
          <LoaderCircle size={iconSize} className="spin" />
        ) : copied ? (
          <Check size={iconSize} className="copy-btn-check-icon" />
        ) : (
          <Copy size={iconSize} />
        )}
      </span>
      <span className="copy-btn-text" aria-live="polite">
        {displayText}
      </span>
    </button>
  );
}
