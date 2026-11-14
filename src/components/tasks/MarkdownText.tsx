"use client";
import React from 'react';

function isSafeUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('data:image/')) return true;
  return false;
}

export function MarkdownText({ text, className = '' }: { text: string; className?: string }) {
  if (!text) return null;

  const parts: Array<{ type: 'text' | 'image'; content?: string; alt?: string; url?: string }> = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    const safe = isSafeUrl(match[2]);
    if (safe) {
      parts.push({ type: 'image', alt: match[1], url: match[2].trim() });
    } else {
      parts.push({ type: 'text', content: match[0] });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return (
    <div className={className}>
      {parts.map((part, idx) => {
        if (part.type === 'image' && part.url) {
          return (
            <div key={idx} className="my-2">
              <a
                href={part.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block max-w-full overflow-hidden rounded-lg border border-edge hover:border-tealhi transition p-1 bg-bg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={part.url}
                  alt={part.alt || 'attachment'}
                  className="max-h-80 max-w-full h-auto rounded object-contain mx-auto"
                  loading="lazy"
                />
              </a>
            </div>
          );
        }
        return <span key={idx} className="whitespace-pre-wrap">{part.content}</span>;
      })}
    </div>
  );
}
