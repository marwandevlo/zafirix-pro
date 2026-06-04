'use client';

import { useState } from 'react';
import { ASSISTANT_SUGGESTED_QUESTIONS } from '@/app/components/assistant/AssistantSourcesPanel';

type Props = {
  onSelect: (question: string) => void;
  disabled?: boolean;
};

export function AssistantSuggestedQuestions({ onSelect, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? ASSISTANT_SUGGESTED_QUESTIONS : ASSISTANT_SUGGESTED_QUESTIONS.slice(0, 6);

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {visible.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(s)}
          className="text-[10px] px-2 py-1 bg-violet-50 text-violet-700 rounded-full hover:bg-violet-100 disabled:opacity-50"
        >
          {s}
        </button>
      ))}
      {ASSISTANT_SUGGESTED_QUESTIONS.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] px-2 py-1 text-gray-500 hover:text-violet-600"
        >
          {expanded ? 'Moins' : `+${ASSISTANT_SUGGESTED_QUESTIONS.length - 6} suggestions`}
        </button>
      )}
    </div>
  );
}
