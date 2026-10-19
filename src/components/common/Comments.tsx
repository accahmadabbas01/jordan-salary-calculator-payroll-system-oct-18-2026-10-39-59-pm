import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { CommentEntityType, TeamComment, User } from '../../types';
import { MessageSquare, X, CheckCircle2, RotateCcw, Reply, Pencil, Trash2, Send } from 'lucide-react';

/** The record a comment thread belongs to */
export interface CommentEntity {
  type: CommentEntityType;
  id: string;
  label: string;
  empId?: string;
  year?: number;
  month?: number;
}

interface CommentsContextValue {
  comments: TeamComment[]; // current company only
  users: User[];
  currentUser: User;
  companyId: string;
  save: (comment: TeamComment) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
}

export const CommentsContext = createContext<CommentsContextValue | null>(null);

export function useComments() {
  return useContext(CommentsContext);
}

/** Usernames mentioned with @username that belong to real users. */
export function parseMentions(text: string, users: User[]): string[] {
  const names = new Set(users.map((u) => u.username.toLowerCase()));
  return Array.from(new Set(Array.from(text.matchAll(/@([\w.\-]+)/g)).map((m) => m[1].toLowerCase()))).filter((n) =>
    names.has(n)
  );
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-GB');
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const AVATAR_COLORS = ['bg-emerald-600', 'bg-indigo-600', 'bg-amber-600', 'bg-rose-600', 'bg-sky-600', 'bg-violet-600'];
const avatarColor = (username: string) =>
  AVATAR_COLORS[Array.from(username).reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

/** Renders text with @mentions highlighted. */
const CommentText: React.FC<{ text: string }> = ({ text }) => (
  <p className="whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200" dir="auto">
    {text.split(/(@[\w.\-]+)/g).map((part, i) =>
      part.startsWith('@') ? (
        <span key={i} className="text-indigo-600 dark:text-indigo-400 font-semibold">
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    )}
  </p>
);

/** Text box with @mention suggestions. Ctrl/⌘+Enter sends. */
export const CommentComposer: React.FC<{
  placeholder?: string;
  initial?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<void> | void;
  onCancel?: () => void;
}> = ({ placeholder = 'Write a comment… use @ to mention a teammate', initial = '', submitLabel = 'Comment', autoFocus, onSubmit, onCancel }) => {
  const ctx = useComments();
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => {
    if (query === null || !ctx) return [];
    const q = query.toLowerCase();
    return ctx.users
      .filter((u) => u.active && (u.username.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [query, ctx]);

  const onChange = (value: string) => {
    setText(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const m = value.slice(0, caret).match(/@([\w.\-]*)$/);
    setQuery(m ? m[1] : null);
  };

  const insertMention = (username: string) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.\-]*)$/, `@${username} `);
    const next = before + text.slice(caret);
    setText(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const submit = async () => {
    if (!text.trim()) return;
    await onSubmit(text.trim());
    setText('');
    setQuery(null);
  };

  return (
    <div className="relative space-y-1.5">
      <textarea
        ref={ref}
        dir="auto"
        rows={2}
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') setQuery(null);
        }}
        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-xs"
      />
      {suggestions.length > 0 && (
        <div className="absolute z-10 left-0 top-full -mt-6 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg overflow-hidden">
          {suggestions.map((u) => (
            <button
              key={u.username}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(u.username);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <span className={`w-5 h-5 rounded-full text-[9px] text-white flex items-center justify-center ${avatarColor(u.username)}`}>
                {initials(u.fullName)}
              </span>
              <span className="font-medium">{u.fullName}</span>
              <span className="text-slate-400">@{u.username}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-2.5 py-1 text-slate-500 hover:text-slate-800">
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!text.trim()}
          onClick={submit}
          className="flex items-center gap-1 px-3 py-1 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-semibold disabled:opacity-40"
        >
          <Send className="w-3 h-3" /> {submitLabel}
        </button>
      </div>
    </div>
  );
};

/** One comment with its actions. */
const CommentItem: React.FC<{ c: TeamComment; isReply?: boolean; onReply?: () => void }> = ({ c, isReply, onReply }) => {
  const ctx = useComments()!;
  const [editing, setEditing] = useState(false);
  const mine = c.author === ctx.currentUser.username;
  const canManage = mine || ctx.currentUser.role === 'admin';

  const toggleResolved = () =>
    ctx.save({
      ...c,
      resolved: !c.resolved,
      resolvedBy: !c.resolved ? ctx.currentUser.username : undefined,
      resolvedAt: !c.resolved ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    });

  const remove = () => {
    const replies = ctx.comments.filter((x) => x.parentId === c.id).map((x) => x.id);
    const msg = replies.length ? `Delete this comment and its ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}?` : 'Delete this comment?';
    if (confirm(msg)) ctx.remove([c.id, ...replies]);
  };

  return (
    <div className={`flex gap-2 ${isReply ? 'ml-7' : ''}`}>
      <span
        className={`shrink-0 w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${avatarColor(c.author)}`}
        title={`@${c.author}`}
      >
        {initials(c.authorName)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{c.authorName}</span>
          <span className="text-slate-400" title={new Date(c.createdAt).toLocaleString()}>
            {timeAgo(c.createdAt)}
            {c.updatedAt !== c.createdAt && !c.resolvedAt ? ' · edited' : ''}
          </span>
          {!isReply && c.resolved && (
            <span className="px-1.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
              Resolved{c.resolvedBy ? ` by @${c.resolvedBy}` : ''}
            </span>
          )}
        </div>
        {editing ? (
          <CommentComposer
            initial={c.text}
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (text) => {
              await ctx.save({ ...c, text, mentions: parseMentions(text, ctx.users), updatedAt: new Date().toISOString() });
              setEditing(false);
            }}
          />
        ) : (
          <CommentText text={c.text} />
        )}
        {!editing && (
          <div className="flex flex-wrap gap-3 mt-0.5 text-[11px] text-slate-500">
            {onReply && (
              <button type="button" onClick={onReply} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100">
                <Reply className="w-3 h-3" /> Reply
              </button>
            )}
            {!isReply && (
              <button type="button" onClick={toggleResolved} className="flex items-center gap-1 hover:text-emerald-600">
                {c.resolved ? <RotateCcw className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {c.resolved ? 'Reopen' : 'Resolve'}
              </button>
            )}
            {mine && (
              <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
            {canManage && (
              <button type="button" onClick={remove} className="flex items-center gap-1 hover:text-rose-600">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/** A top-level comment with its replies and a reply box. */
export const CommentThreadItem: React.FC<{ root: TeamComment }> = ({ root }) => {
  const ctx = useComments()!;
  const [replying, setReplying] = useState(false);
  const replies = ctx.comments
    .filter((c) => c.parentId === root.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className={`space-y-2 p-2.5 rounded-lg border ${root.resolved ? 'border-slate-200 dark:border-slate-800 opacity-70' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
      <CommentItem c={root} onReply={() => setReplying(true)} />
      {replies.map((r) => (
        <CommentItem key={r.id} c={r} isReply />
      ))}
      {replying && (
        <div className="ml-7">
          <CommentComposer
            placeholder="Reply… use @ to mention"
            submitLabel="Reply"
            autoFocus
            onCancel={() => setReplying(false)}
            onSubmit={async (text) => {
              await ctx.save(newComment(ctx, entityOf(root), text, root.id));
              setReplying(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

const entityOf = (c: TeamComment): CommentEntity => ({
  type: c.entityType,
  id: c.entityId,
  label: c.entityLabel,
  empId: c.empId,
  year: c.year,
  month: c.month,
});

export function newComment(ctx: CommentsContextValue, entity: CommentEntity, text: string, parentId?: string): TeamComment {
  const now = new Date().toISOString();
  return {
    id: `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    companyId: ctx.companyId,
    entityType: entity.type,
    entityId: entity.id,
    entityLabel: entity.label,
    empId: entity.empId,
    year: entity.year,
    month: entity.month,
    parentId,
    text,
    author: ctx.currentUser.username,
    authorName: ctx.currentUser.fullName || ctx.currentUser.username,
    createdAt: now,
    updatedAt: now,
    mentions: parseMentions(text, ctx.users),
    resolved: false,
  };
}

/** All comments on one record, newest thread last, with a box to add one. */
export const CommentThread: React.FC<{ entity: CommentEntity }> = ({ entity }) => {
  const ctx = useComments();
  const [showResolved, setShowResolved] = useState(false);
  if (!ctx) return null;
  const roots = ctx.comments
    .filter((c) => !c.parentId && c.entityType === entity.type && c.entityId === entity.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const resolvedCount = roots.filter((r) => r.resolved).length;
  const visible = roots.filter((r) => showResolved || !r.resolved);

  return (
    <div className="space-y-3 text-xs">
      {visible.length === 0 && (
        <p className="text-slate-400 text-center py-3">No open comments yet. Start the conversation below.</p>
      )}
      {visible.map((r) => (
        <CommentThreadItem key={r.id} root={r} />
      ))}
      {resolvedCount > 0 && (
        <button type="button" onClick={() => setShowResolved(!showResolved)} className="text-blue-600 dark:text-blue-400 hover:underline">
          {showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
        </button>
      )}
      <CommentComposer onSubmit={(text) => ctx.save(newComment(ctx, entity, text))} />
    </div>
  );
};

/** Button with the number of open comments; opens the thread in a side panel. */
export const CommentsButton: React.FC<{ entity: CommentEntity; compact?: boolean }> = ({ entity, compact }) => {
  const ctx = useComments();
  const [open, setOpen] = useState(false);
  if (!ctx) return null;
  const roots = ctx.comments.filter((c) => !c.parentId && c.entityType === entity.type && c.entityId === entity.id);
  const openCount = roots.filter((c) => !c.resolved).length;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          compact
            ? `relative p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${openCount ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-700'}`
            : 'flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700'
        }
        title={`Notes & comments — ${entity.label}`}
      >
        <MessageSquare className={compact ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5 text-indigo-500'} />
        {!compact && <span>Comments</span>}
        {openCount > 0 &&
          (compact ? (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
              {openCount}
            </span>
          ) : (
            <span className="px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{openCount}</span>
          ))}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md h-full bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-white dark:bg-slate-900">
              <div>
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                  <MessageSquare className="w-4 h-4 text-indigo-500" /> Notes & comments
                </div>
                <div className="text-[11px] text-slate-500" dir="auto">
                  {entity.label}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <CommentThread entity={entity} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
