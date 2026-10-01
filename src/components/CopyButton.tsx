import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CopyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text: string;
  label?: string;
  copiedLabel?: string;
  iconSize?: number;
  onCopied?: () => void;
}

/**
 * Universal copy button that provides high-visibility feedback with a smooth,
 * professional transition, pop animation, and cross-browser clipboard fallback.
 */
export function CopyButton({
  text,
  label = 'Copy link',
  copiedLabel = 'Copied!',
  iconSize = 16,
  className = 'button button-secondary',
  onClick,
  onCopied,
  disabled,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!text || copied) return;

    let succeeded = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        succeeded = true;
      }
    } catch {
      succeeded = false;
    }

    if (!succeeded) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
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
      }, 2200);
    }
  };

  return (
    <button
      type="button"
      className={`copy-btn ${className} ${copied ? 'copy-btn-copied' : ''}`}
      onClick={(e) => void handleCopy(e)}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      disabled={disabled}
      {...rest}
    >
      <span className="copy-btn-icon-wrap" aria-hidden="true">
        {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      </span>
      <span className="copy-btn-text" aria-live="polite">
        {copied ? copiedLabel : label}
      </span>
    </button>
  );
}
