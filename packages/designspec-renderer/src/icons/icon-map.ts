export interface IconEntry {
  /** The lucide-react component name used for rendering and codegen. */
  readonly componentName: string;
  /** Common aliases an LLM may emit instead of the canonical key. */
  readonly aliases?: readonly string[];
}

/** Canonical semantic icon names mapped to lucide-react exports. */
export const ICON_MAP: Record<string, IconEntry> = {
  // Navigation
  'home': { componentName: 'Home' },
  'menu': { componentName: 'Menu' },
  'arrow-left': { componentName: 'ArrowLeft' },
  'arrow-right': { componentName: 'ArrowRight' },
  'chevron-down': { componentName: 'ChevronDown' },
  'chevron-up': { componentName: 'ChevronUp' },
  'chevron-left': { componentName: 'ChevronLeft' },
  'chevron-right': { componentName: 'ChevronRight' },
  'external-link': { componentName: 'ExternalLink' },
  'arrow-up': { componentName: 'ArrowUp' },
  'arrow-down': { componentName: 'ArrowDown' },

  // Actions
  'search': { componentName: 'Search', aliases: ['magnifying-glass', 'find', 'lookup'] },
  'filter': { componentName: 'Filter', aliases: ['funnel'] },
  'sort': { componentName: 'ArrowUpDown', aliases: ['sort-asc', 'sort-desc', 'order'] },
  'plus': { componentName: 'Plus', aliases: ['add', 'create', 'new'] },
  'minus': { componentName: 'Minus', aliases: ['subtract', 'remove'] },
  'edit': { componentName: 'Pencil', aliases: ['pencil', 'pen', 'modify', 'write'] },
  'delete': { componentName: 'Trash2', aliases: ['trash', 'bin', 'garbage'] },
  'copy': { componentName: 'Copy', aliases: ['duplicate', 'clipboard'] },
  'share': { componentName: 'Share2', aliases: ['share-2'] },
  'download': { componentName: 'Download' },
  'upload': { componentName: 'Upload' },
  'refresh': { componentName: 'RefreshCw', aliases: ['reload', 'sync', 'rotate'] },
  'more': { componentName: 'MoreHorizontal', aliases: ['dots', 'ellipsis', 'three-dots', 'kebab'] },
  'more-vertical': { componentName: 'MoreVertical', aliases: ['dots-vertical', 'kebab-vertical'] },
  'close': { componentName: 'X', aliases: ['x', 'cancel', 'dismiss', 'cross'] },
  'expand': { componentName: 'Maximize2', aliases: ['maximize', 'fullscreen'] },
  'collapse': { componentName: 'Minimize2', aliases: ['minimize'] },
  'undo': { componentName: 'Undo2' },
  'redo': { componentName: 'Redo2' },

  // Status
  'check': { componentName: 'Check', aliases: ['checkmark', 'done', 'complete', 'tick'] },
  'check-circle': { componentName: 'CheckCircle2', aliases: ['success', 'verified'] },
  'x-circle': { componentName: 'XCircle', aliases: ['error-circle', 'fail'] },
  'alert-circle': { componentName: 'CircleAlert', aliases: ['error', 'danger'] },
  'info': { componentName: 'Info', aliases: ['information'] },
  'alert-triangle': { componentName: 'TriangleAlert', aliases: ['warning', 'caution'] },
  'clock': { componentName: 'Clock', aliases: ['time', 'timer', 'schedule'] },
  'loader': { componentName: 'Loader2', aliases: ['loading', 'spinner'] },
  'circle': { componentName: 'Circle' },
  'circle-dot': { componentName: 'CircleDot', aliases: ['radio'] },

  // Content
  'user': { componentName: 'User', aliases: ['person', 'account', 'profile'] },
  'users': { componentName: 'Users', aliases: ['people', 'group', 'team'] },
  'mail': { componentName: 'Mail', aliases: ['email', 'envelope', 'inbox'] },
  'phone': { componentName: 'Phone', aliases: ['call', 'telephone'] },
  'calendar': { componentName: 'Calendar', aliases: ['date', 'schedule-date'] },
  'file': { componentName: 'File', aliases: ['document', 'page'] },
  'file-text': { componentName: 'FileText', aliases: ['document-text'] },
  'folder': { componentName: 'Folder' },
  'image': { componentName: 'Image', aliases: ['photo', 'picture'] },
  'link': { componentName: 'Link', aliases: ['url', 'chain'] },
  'tag': { componentName: 'Tag', aliases: ['label'] },
  'bookmark': { componentName: 'Bookmark', aliases: ['save', 'pin'] },
  'star': { componentName: 'Star', aliases: ['favorite', 'favourite', 'rate'] },
  'heart': { componentName: 'Heart', aliases: ['like', 'love'] },
  'thumbs-up': { componentName: 'ThumbsUp', aliases: ['approve'] },
  'map-pin': { componentName: 'MapPin', aliases: ['location', 'pin', 'place'] },
  'globe': { componentName: 'Globe', aliases: ['world', 'web', 'internet', 'language'] },
  'hash': { componentName: 'Hash', aliases: ['number', 'pound'] },
  'list': { componentName: 'List', aliases: ['lines'] },
  'grid': { componentName: 'LayoutGrid', aliases: ['layout-grid', 'tiles'] },
  'bar-chart': { componentName: 'BarChart3', aliases: ['chart', 'analytics', 'stats'] },
  'pie-chart': { componentName: 'PieChart', aliases: ['donut'] },
  'trending-up': { componentName: 'TrendingUp', aliases: ['growth', 'increase'] },
  'trending-down': { componentName: 'TrendingDown', aliases: ['decline', 'decrease'] },

  // Commerce
  'shopping-cart': { componentName: 'ShoppingCart', aliases: ['cart', 'basket'] },
  'credit-card': { componentName: 'CreditCard', aliases: ['card', 'payment'] },
  'dollar-sign': { componentName: 'DollarSign', aliases: ['money', 'currency', 'price'] },
  'receipt': { componentName: 'Receipt', aliases: ['invoice', 'bill'] },
  'wallet': { componentName: 'Wallet', aliases: ['purse'] },
  'percent': { componentName: 'Percent', aliases: ['discount'] },

  // Communication
  'bell': { componentName: 'Bell', aliases: ['notification', 'ring'] },
  'message-circle': { componentName: 'MessageCircle', aliases: ['chat', 'comment', 'bubble'] },
  'message-square': { componentName: 'MessageSquare', aliases: ['chat-square'] },
  'send': { componentName: 'Send', aliases: ['submit', 'paper-plane'] },
  'at-sign': { componentName: 'AtSign', aliases: ['at', 'mention'] },

  // Settings / system
  'settings': { componentName: 'Settings', aliases: ['gear', 'cog', 'preferences'] },
  'lock': { componentName: 'Lock', aliases: ['locked', 'secure', 'password'] },
  'unlock': { componentName: 'LockOpen', aliases: ['unlocked'] },
  'eye': { componentName: 'Eye', aliases: ['visible', 'show', 'view'] },
  'eye-off': { componentName: 'EyeOff', aliases: ['hidden', 'hide', 'invisible'] },
  'toggle-left': { componentName: 'ToggleLeft', aliases: ['switch-off'] },
  'toggle-right': { componentName: 'ToggleRight', aliases: ['switch-on', 'toggle'] },
  'shield': { componentName: 'Shield', aliases: ['security', 'protection'] },
  'key': { componentName: 'KeyRound', aliases: ['api-key', 'access'] },
  'log-out': { componentName: 'LogOut', aliases: ['logout', 'sign-out', 'exit'] },
  'log-in': { componentName: 'LogIn', aliases: ['login', 'sign-in'] },
  'zap': { componentName: 'Zap', aliases: ['lightning', 'flash', 'quick'] },
  'help-circle': { componentName: 'CircleHelp', aliases: ['help', 'question', 'faq'] },
};

function normalizeIconName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

/** Resolve a semantic icon name or alias to its canonical key. */
export function resolveIconName(input: string): string | null {
  const normalized = normalizeIconName(input);
  if (!normalized) return null;

  if (ICON_MAP[normalized]) return normalized;

  for (const [canonical, entry] of Object.entries(ICON_MAP)) {
    if (entry.aliases?.some((alias) => normalizeIconName(alias) === normalized)) {
      return canonical;
    }
  }

  return null;
}

/** Resolve a semantic icon name or alias to the lucide component export name. */
export function getIconComponentName(input: string): string | null {
  const canonical = resolveIconName(input);
  return canonical ? ICON_MAP[canonical]?.componentName ?? null : null;
}

/** Return all canonical semantic icon names for prompt injection. */
export function getCanonicalIconNames(): string[] {
  return Object.keys(ICON_MAP);
}
