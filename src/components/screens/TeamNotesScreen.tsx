import React, { useMemo, useState } from 'react';
import { TeamComment } from '../../types';
import { CommentComposer, CommentThreadItem, newComment, timeAgo, useComments } from '../common/Comments';
import { MessagesSquare, ExternalLink, Search } from 'lucide-react';

interface TeamNotesScreenProps {
  onOpenEntity: (comment: TeamComment) => void;
}

type Filter = 'open' | 'mentions' | 'mine' | 'resolved' | 'all';

const ENTITY_LABELS: Record<TeamComment['entityType'], string> = {
  general: 'Team note',
  employee: 'Employee',
  salary: 'Salary',
  payroll_month: 'Payroll run',
  clearance: 'Clearance',
  maternity: 'Maternity leave',
};

/** Company-wide feed of notes and comment threads. */
export const TeamNotesScreen: React.FC<TeamNotesScreenProps> = ({ onOpenEntity }) => {
  const ctx = useComments();
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');

  const threads = useMemo(() => {
    if (!ctx) return [];
    const me = ctx.currentUser.username;
    const roots = ctx.comments.filter((c) => !c.parentId);
    const repliesOf = (id: string) => ctx.comments.filter((c) => c.parentId === id);
    const q = search.trim().toLowerCase();
    return roots
      .map((root) => {
        const replies = repliesOf(root.id);
        const lastActivity = [root, ...replies].reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), root.updatedAt);
        const all = [root, ...replies];
        return {
          root,
          replies,
          lastActivity,
          mentionsMe: all.some((c) => c.mentions.includes(me) && c.author !== me),
          involvesMe: all.some((c) => c.author === me),
          text: all.map((c) => `${c.text} ${c.authorName} ${c.entityLabel}`).join(' ').toLowerCase(),
        };
      })
      .filter((t) => {
        if (q && !t.text.includes(q)) return false;
        switch (filter) {
          case 'open':
            return !t.root.resolved;
          case 'mentions':
            return t.mentionsMe;
          case 'mine':
            return t.involvesMe;
          case 'resolved':
            return t.root.resolved;
          default:
            return true;
        }
      })
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  }, [ctx, filter, search]);

  if (!ctx) return null;

  const counts = {
    open: ctx.comments.filter((c) => !c.parentId && !c.resolved).length,
    mentions: ctx.comments.filter(
      (c) => c.mentions.includes(ctx.currentUser.username) && c.author !== ctx.currentUser.username
    ).length,
  };

  const tabs: { id: Filter; label: string; count?: number }[] = [
    { id: 'open', label: 'Open', count: counts.open },
    { id: 'mentions', label: 'Mentions me', count: counts.mentions },
    { id: 'mine', label: 'My threads' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MessagesSquare className="w-4 h-4 text-indigo-500" />
            <span>
              Team Notes <span className="font-arabic text-slate-500">· ملاحظات الفريق</span>
            </span>
          </h2>
          <p className="text-slate-500">
            Every note and comment in this company. Comment on employees, salaries, payroll runs, clearances and maternity
            leaves from their screens; @mention teammates to get their attention. Changes reach the team through cloud
            sync.
          </p>
        </div>
        <CommentComposer
          placeholder="Post a note for the whole team… use @ to mention someone"
          submitLabel="Post note"
          onSubmit={(text) =>
            ctx.save(
              newComment(ctx, { type: 'general', id: `general_${ctx.companyId}`, label: 'Team note' }, text)
            )
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-md">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1 rounded font-semibold ${
                filter === t.id ? 'bg-white dark:bg-slate-900 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-500'
              }`}
            >
              {t.label}
              {t.count ? <span className="ml-1 text-indigo-600 dark:text-indigo-400">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes"
            className="bg-transparent outline-none w-40"
          />
        </label>
      </div>

      {threads.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-10 rounded-lg border border-slate-200 dark:border-slate-800 text-center text-slate-400">
          Nothing here.
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => (
            <div key={t.root.id} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[10px] uppercase tracking-wide">
                    {ENTITY_LABELS[t.root.entityType]}
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate" dir="auto">
                    {t.root.entityLabel}
                  </span>
                  {t.mentionsMe && (
                    <span className="px-1.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-semibold">
                      @you
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span>{timeAgo(t.lastActivity)}</span>
                  {t.root.entityType !== 'general' && (
                    <button
                      type="button"
                      onClick={() => onOpenEntity(t.root)}
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <CommentThreadItem root={t.root} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
