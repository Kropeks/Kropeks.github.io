'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  Sun,
  Moon,
  Menu,
  X,
  ChefHat,
  LogIn,
  ChevronRight,
  ArrowRight,
  MessageCircle,
  MoreHorizontal,
  Minus,
  Paperclip,
  Send,
  Gamepad2,
  Utensils,
  User,
  ChevronDown,
  ShieldCheck,
  Crown,
  Home,
  Heart,
  Sparkles,
  ClipboardList,
  Info,
  Search,
  Loader2,
  MailQuestion,
  Settings2,
  SquarePen,
  CheckCheck,
  Trash2
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useProfileSettings } from '@/context/ProfileSettingsContext';
import { useAuthModal } from '@/components/AuthProvider';
import { NotificationsBell } from '@/components/notifications/NotificationsBell';

// Dynamically import the MemoryGame component with no SSR
const MemoryGame = dynamic(() => import('./games/MemoryGame'), {
  ssr: false,
});

export default function Header() {
  // Hooks must be called unconditionally at the top level
  const { data: session, status, update } = useSession();
  const { requireAuth } = useAuthModal();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(status === 'loading');
  const [isScrolled, setIsScrolled] = useState(false);
  const [showMemoryGame, setShowMemoryGame] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [gameMode, setGameMode] = useState(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatFeatureEnabled = process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true';
  const [chatConversations, setChatConversations] = useState([]);
  const [chatConversationsLoading, setChatConversationsLoading] = useState(false);
  const [chatConversationsError, setChatConversationsError] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatMessagesById, setChatMessagesById] = useState({});
  const [chatMessagesLoadingIds, setChatMessagesLoadingIds] = useState({});
  const [chatMessagesErrors, setChatMessagesErrors] = useState({});
  const [chatHeads, setChatHeads] = useState([]);
  const [mobileChatConversationId, setMobileChatConversationId] = useState(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [recentIncomingChat, setRecentIncomingChat] = useState(null);
  const [chatDrafts, setChatDrafts] = useState({});
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const userMenuRef = useRef(null);
  const chatMenuRef = useRef(null);
  const chatOptionsMenuRefs = useRef({});
  const messengerMessagesContainerRef = useRef(null);
  const mobileOverlayMessagesContainerRef = useRef(null);
  const chatHeadMessagesContainerRefs = useRef({});
  const searchMenuRef = useRef(null);
  const searchInputRef = useRef(null);
  const chatSearchInputRef = useRef(null);
  const previousChatConversationsRef = useRef([]);
  const chatConversationsHydratedRef = useRef(false);
  const chatMessagesByIdRef = useRef({});
  const activeChatPollingRef = useRef(null);
  const chatOpenRef = useRef(false);
  const activeChatIdRef = useRef(null);
  const conversationPollingRef = useRef(null);
  const lastNotifiedMessageRef = useRef({});
  const hasAttemptedSessionRefresh = useRef(false);
  const searchAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const router = useRouter();
  const userEmail = session?.user?.email?.toLowerCase();
  const userRole = session?.user?.role?.toLowerCase();
  const sessionUserId = session?.user?.id;
  const isAdminUser = userRole === 'admin' || userEmail === 'savoryadmin@example.com';
  const isPremiumUser = userRole === 'premium';
  const isPremiumMember = hasPremiumAccess || isPremiumUser;
  const totalUnreadMessages = useMemo(
    () =>
      chatConversations.reduce(
        (sum, conversation) => sum + (Number(conversation?.unreadCount) || 0),
        0
      ),
    [chatConversations]
  );
  const filteredChatConversations = useMemo(() => {
    const term = chatSearchTerm.trim().toLowerCase();
    if (!term) {
      return chatConversations;
    }

    return chatConversations.filter((conversation) => {
      const candidate =
        conversation?.otherParticipantName ||
        conversation?.topic ||
        conversation?.lastMessagePreview ||
        '';
      return candidate.toLowerCase().includes(term);
    });
  }, [chatConversations, chatSearchTerm]);
  const activeConversation = useMemo(
    () => chatConversations.find((conversation) => conversation.id === activeChatId) ?? null,
    [chatConversations, activeChatId]
  );
  const chatMessages = activeChatId ? chatMessagesById[activeChatId] ?? [] : [];
  const activeChatDraft = activeChatId ? chatDrafts[activeChatId] ?? '' : '';
  const isActiveChatLoading = Boolean(activeChatId && chatMessagesLoadingIds[activeChatId]);
  const activeChatError = activeChatId ? chatMessagesErrors[activeChatId] : null;
  const activeConversationTyping = Boolean(
    activeConversation?.otherParticipantTyping ??
      activeConversation?.isTyping ??
      activeConversation?.typing
  );
  const mobileChatHead = useMemo(
    () => chatHeads.find((head) => head.conversationId === mobileChatConversationId) ?? null,
    [chatHeads, mobileChatConversationId]
  );
  const mobileConversation = useMemo(
    () =>
      chatConversations.find((conversation) => conversation.id === mobileChatConversationId) ?? null,
    [chatConversations, mobileChatConversationId]
  );
  const mobileMessages = mobileChatConversationId
    ? chatMessagesById[mobileChatConversationId] ?? []
    : [];
  const mobileChatDraft = mobileChatConversationId
    ? chatDrafts[mobileChatConversationId] ?? ''
    : '';
  const isMobileChatLoading = Boolean(
    mobileChatConversationId && chatMessagesLoadingIds[mobileChatConversationId]
  );
  const mobileChatError = mobileChatConversationId
    ? chatMessagesErrors[mobileChatConversationId] ?? null
    : null;
  const mobileConversationTyping = Boolean(
    mobileConversation?.otherParticipantTyping ??
      mobileConversation?.isTyping ??
      mobileConversation?.typing
  );
  const mobileAvatarUrl = mobileConversation?.otherParticipantAvatar || null;
  const mobileInitials = (mobileChatHead?.name || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
  const mobileOtherParticipantOnline = Boolean(
    mobileConversation?.otherParticipantOnline ??
      mobileConversation?.online ??
      mobileConversation?.presence === 'online'
  );
  const mobileLastOwnMessageReadMeta = useMemo(() => {
    for (let index = mobileMessages.length - 1; index >= 0; index -= 1) {
      const message = mobileMessages[index];
      const senderEmail = message?.senderEmail?.toLowerCase();
      const isOwnMessage = senderEmail
        ? senderEmail === userEmail
        : message?.senderId === session?.user?.id;

      if (isOwnMessage) {
        const readTimestamp =
          message?.readAt ||
          message?.seenAt ||
          message?.readTimestamp ||
          (message?.read === true ? message?.updatedAt || message?.createdAt : null);

        if (readTimestamp) {
          return {
            messageId: message?.id ?? null,
            timestamp: readTimestamp,
          };
        }
      }
    }

    return null;
  }, [mobileMessages, session?.user?.id, userEmail]);
  const mobileLastOwnMessageReadId = mobileLastOwnMessageReadMeta?.messageId ?? null;
  const lastOwnMessageReadMeta = useMemo(() => {
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
      const message = chatMessages[index];
      const senderEmail = message?.senderEmail?.toLowerCase();
      const isOwnMessage = senderEmail
        ? senderEmail === userEmail
        : message?.senderId === session?.user?.id;

      if (isOwnMessage) {
        const readTimestamp =
          message?.readAt ||
          message?.seenAt ||
          message?.readTimestamp ||
          (message?.read === true ? message?.updatedAt || message?.createdAt : null);

        if (readTimestamp) {
          return {
            messageId: message?.id ?? null,
            timestamp: readTimestamp,
          };
        }
      }
    }

    return null;
  }, [chatMessages, session?.user?.id, userEmail]);
  const lastOwnMessageReadAt = lastOwnMessageReadMeta?.timestamp ?? null;
  const lastOwnMessageReadMessageId = lastOwnMessageReadMeta?.messageId ?? null;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setIsMobileViewport(isMobile);
      if (!isMobile) {
        setMobileChatOpen(false);
        setMobileChatConversationId(null);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    chatMessagesByIdRef.current = chatMessagesById;
  }, [chatMessagesById]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const getChatHeadContainerRef = useCallback((conversationId) => {
    if (!conversationId) {
      return null;
    }

    if (!chatHeadMessagesContainerRefs.current[conversationId]) {
      chatHeadMessagesContainerRefs.current[conversationId] = {
        desktop: null,
      };
    }

    return chatHeadMessagesContainerRefs.current[conversationId];
  }, []);

  const scrollElementToBottom = useCallback((element, behavior = 'auto') => {
    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  }, []);

  const scrollMessagesToBottom = useCallback(({
    behavior = 'auto',
    context = 'messenger',
    conversationId = null,
  } = {}) => {
    let target = null;

    if (context === 'messenger') {
      target = messengerMessagesContainerRef.current;
    } else if (context === 'mobileOverlay') {
      target = mobileOverlayMessagesContainerRef.current;
    } else if (context === 'chatHead') {
      const refObject = getChatHeadContainerRef(conversationId);
      target = refObject?.desktop ?? null;
    }

    if (!target) {
      return;
    }

    scrollElementToBottom(target, behavior);
  }, []);

  const scheduleScrollToBottom = useCallback(
    (options) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => scrollMessagesToBottom(options));
      } else {
        scrollMessagesToBottom(options);
      }
    },
    [scrollMessagesToBottom]
  );

  useEffect(() => {
    if (!chatFeatureEnabled || status !== 'authenticated' || !activeChatId) {
      return;
    }

    scheduleScrollToBottom({ behavior: 'auto', context: 'messenger' });
  }, [chatFeatureEnabled, status, activeChatId, scheduleScrollToBottom]);

  useEffect(() => {
    if (!chatFeatureEnabled || status !== 'authenticated') {
      return;
    }

    if (chatOpen && activeChatId) {
      scheduleScrollToBottom({ behavior: 'smooth', context: 'messenger' });
    }

    if (mobileChatOpen && mobileChatConversationId) {
      scheduleScrollToBottom({ behavior: 'smooth', context: 'mobileOverlay' });
    }

    chatHeads
      .filter((head) => !head.minimized)
      .forEach((head) => {
        const messages = chatMessagesById[head.conversationId];
        if (Array.isArray(messages) && messages.length > 0) {
          scheduleScrollToBottom({
            behavior: 'smooth',
            context: 'chatHead',
            conversationId: head.conversationId,
          });
        }
      });
  }, [
    chatFeatureEnabled,
    status,
    chatOpen,
    activeChatId,
    chatHeads,
    chatMessagesById,
    mobileChatOpen,
    mobileChatConversationId,
    scheduleScrollToBottom,
  ]);

  const formatChatTimestamp = useCallback((isoString) => {
    if (!isoString) {
      return null;
    }

    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

    if (diffMinutes < 1) {
      return 'Just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }
    if (diffHours < 24) {
      return `${diffHours} hr ago`;
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchError(null);
    setSearchResults((previous) => previous);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 20);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError(null);
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  }, []);

  const executeSearch = useCallback(async (query) => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchLoading(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/search/users?q=${encodeURIComponent(query)}&limit=8`, {
        signal: controller.signal,
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Unable to search users');
      }

      const data = await response.json();
      setSearchResults(Array.isArray(data?.users) ? data.users : []);
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('User search failed:', error);
      setSearchError('Unable to load search results. Try again.');
      setSearchResults([]);
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
      }
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = useCallback((event) => {
    const nextValue = event.target.value;
    setSearchQuery(nextValue);
  }, []);

  const formatSearchUserName = useCallback((user) => {
    return user?.displayName?.trim() || user?.name || user?.email || 'SavoryFlavors member';
  }, []);

  const resolveSearchSubtitle = useCallback((user) => {
    const role = user?.role?.toString().toLowerCase();
    if (role === 'admin' && user?.adminTitle) {
      return user.adminTitle;
    }
    if (!role) {
      return 'Member';
    }
    return role.charAt(0).toUpperCase() + role.slice(1);
  }, []);

  const formatSearchStats = useCallback((user) => {
    const recipeCount = Number(user?.recipeCount ?? 0);
    const postCount = Number(user?.postCount ?? 0);
    const recipeLabel = recipeCount === 1 ? 'recipe' : 'recipes';
    const postLabel = postCount === 1 ? 'post' : 'posts';
    return `${recipeCount} ${recipeLabel} · ${postCount} ${postLabel}`;
  }, []);

  const handleSearchSelect = useCallback(
    (userId) => {
      if (!userId) {
        return;
      }
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
      closeSearch();
      router.push(`/users/${userId}`);
    },
    [closeSearch, mobileMenuOpen, router]
  );

  // Handle session state
  useEffect(() => {
    let isActive = true;

    const checkSession = async () => {
      if (status === 'loading') {
        if (isActive) {
          setIsLoading(true);
        }
        return;
      }

      if (status === 'authenticated') {
        if (isActive) {
          setIsLoading(false);
        }
        return;
      }

      if (status === 'unauthenticated') {
        if (hasAttemptedSessionRefresh.current) {
          if (isActive) {
            setIsLoading(false);
          }
          return;
        }

        hasAttemptedSessionRefresh.current = true;
        if (isActive) {
          setIsLoading(true);
        }

        try {
          const result = await update();
          if (result?.error) {
            console.error('Session refresh failed:', result.error);
          }
        } catch (error) {
          console.error('Session check error:', error);
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      }
    };

    checkSession();

    return () => {
      isActive = false;
    };
  }, [status, update]);

  // Set mounted state
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleSearchClickOutside = (event) => {
      if (searchMenuRef.current && !searchMenuRef.current.contains(event.target)) {
        closeSearch();
      }
    };

    if (searchOpen) {
      document.addEventListener('mousedown', handleSearchClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleSearchClickOutside);
    };
  }, [closeSearch, searchOpen]);

  // Handle click outside for user menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchMessages = useCallback(
    async (conversationId, { force = false, background = false } = {}) => {
      if (!conversationId || !chatFeatureEnabled || status !== 'authenticated') {
        return;
      }

      const currentMessages = chatMessagesByIdRef.current[conversationId];
      const alreadyLoaded = Array.isArray(currentMessages) && currentMessages.length > 0;
      if (!force && alreadyLoaded) {
        return;
      }

      if (!background) {
        setChatMessagesLoadingIds((previous) => ({
          ...previous,
          [conversationId]: true,
        }));
      }
      setChatMessagesErrors((previous) => ({
        ...previous,
        [conversationId]: null,
      }));

      try {
        const response = await fetch(`/api/chat/messages?conversationId=${conversationId}`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Unable to load messages');
        }

        const data = await response.json();
        const messages = Array.isArray(data?.messages) ? data.messages : [];
        setChatMessagesById((previous) => ({
          ...previous,
          [conversationId]: messages,
        }));
      } catch (error) {
        console.error('Chat message fetch failed:', error);
        setChatMessagesById((previous) => ({
          ...previous,
          [conversationId]: [],
        }));
        setChatMessagesErrors((previous) => ({
          ...previous,
          [conversationId]: error.message || 'Unable to load messages',
        }));
      } finally {
        if (!background) {
          setChatMessagesLoadingIds((previous) => ({
            ...previous,
            [conversationId]: false,
          }));
        }
      }
    },
    [chatFeatureEnabled, status]
  );

  const markConversationRead = useCallback(
    async (conversationId) => {
      if (!conversationId || !chatFeatureEnabled || status !== 'authenticated') {
        return;
      }

      try {
        await fetch('/api/chat/conversations', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ conversationId }),
        });
      } catch (error) {
        console.error('Failed to mark conversation read:', error);
      }
    },
    [chatFeatureEnabled, status]
  );

  const fetchConversations = useCallback(async () => {
    if (!chatFeatureEnabled || status !== 'authenticated') {
      return;
    }

    setChatConversationsLoading(true);
    setChatConversationsError(null);

    try {
      const response = await fetch(`/api/chat/conversations`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        const fallbackMessage = response.status === 401 ? 'Sign in to view conversations' : 'No conversations yet';
        setChatConversations([]);
        setChatConversationsError(fallbackMessage);
        setActiveChatId(null);
        return;
      }

      const data = await response.json().catch(() => ({ conversations: [] }));
      const conversations = Array.isArray(data?.conversations) ? data.conversations : [];

      const previousConversations = previousChatConversationsRef.current;
      const previousById = previousConversations.reduce((acc, conversation) => {
        acc[conversation.id] = conversation;
        return acc;
      }, {});

      const userId = session?.user?.id;
      let incomingConversation = null;

      conversations.forEach((conversation) => {
        const prior = previousById[conversation.id];
        const unreadCount = Number(conversation?.unreadCount || 0);
        const lastMessageId = conversation?.lastMessageId;

        const previousUnreadCount = Number(prior?.unreadCount || 0);
        const lastMessageIdChanged = prior?.lastMessageId !== lastMessageId;
        const lastMessageFromOther =
          Number(conversation?.lastMessageSenderId) &&
          Number(conversation.lastMessageSenderId) !== Number(userId);
        const lastNotifiedId = lastNotifiedMessageRef.current[conversation.id];

        if (
          lastMessageId &&
          (!chatConversationsHydratedRef.current || unreadCount > previousUnreadCount || lastMessageIdChanged) &&
          unreadCount > 0 &&
          lastMessageFromOther &&
          lastNotifiedId !== lastMessageId
        ) {
          incomingConversation = {
            id: conversation.id,
            unreadCount,
            name: conversation.otherParticipantName || conversation.topic || 'Conversation',
            preview: conversation.lastMessageBody || conversation.lastMessagePreview || 'New message',
            lastMessageId,
          };
        }
      });

      setChatConversations(conversations);
      previousChatConversationsRef.current = conversations;
      chatConversationsHydratedRef.current = true;

      if (conversations.length && !incomingConversation) {
        setActiveChatId((previous) => previous ?? conversations[0].id);
      }

      if (incomingConversation) {
        lastNotifiedMessageRef.current[incomingConversation.id] = incomingConversation.lastMessageId;
        setRecentIncomingChat({
          conversationId: incomingConversation.id,
          preview: incomingConversation.preview,
          name: incomingConversation.name,
          timestamp: Date.now(),
          lastMessageId: incomingConversation.lastMessageId,
        });

        setChatHeads((prev) => {
          const exists = prev.some((head) => head.conversationId === incomingConversation.id);
          if (exists) {
            return prev.map((head) =>
              head.conversationId === incomingConversation.id
                ? { ...head, minimized: false }
                : head
            );
          }

          return [
            ...prev,
            {
              id: `chat-head-${incomingConversation.id}`,
              conversationId: incomingConversation.id,
              name: incomingConversation.name,
              preview: incomingConversation.preview,
              minimized: false,
            },
          ];
        });
        setActiveChatId((previous) => previous ?? incomingConversation.id);

        if (activeChatIdRef.current === incomingConversation.id) {
          fetchMessages(incomingConversation.id, { force: true, background: true });
        }
      }
    } catch (error) {
      console.error('Chat conversation fetch failed:', error);
      setChatConversationsError(error.message || 'Unable to load conversations');
      setChatConversations([]);
      setActiveChatId(null);
    } finally {
      setChatConversationsLoading(false);
    }
  }, [chatFeatureEnabled, status, fetchMessages, session?.user?.id]);

  useEffect(() => {
    if (!chatFeatureEnabled) {
      setChatOpen(false);
      setChatConversations([]);
      setActiveChatId(null);
      setChatHeads([]);
      setChatDrafts({});
      setChatMessagesById({});
      setChatMessagesErrors({});
      setChatMessagesLoadingIds({});
      setChatConversationsError(null);
      return;
    }
  }, [chatFeatureEnabled]);

  useEffect(() => {
    if (!chatFeatureEnabled || status !== 'authenticated' || !activeChatId) {
      return;
    }

    fetchMessages(activeChatId);
  }, [chatFeatureEnabled, status, activeChatId, fetchMessages]);

  useEffect(() => {
    if (!chatFeatureEnabled || status !== 'authenticated' || !activeChatId || !chatOpen) {
      if (activeChatPollingRef.current) {
        clearInterval(activeChatPollingRef.current);
        activeChatPollingRef.current = null;
      }
      return undefined;
    }

    fetchMessages(activeChatId, { force: true, background: true });
    const interval = setInterval(() => {
      fetchMessages(activeChatId, { force: true, background: true });
    }, 2000);
    activeChatPollingRef.current = interval;

    return () => {
      clearInterval(interval);
      activeChatPollingRef.current = null;
    };
  }, [chatFeatureEnabled, status, chatOpen, activeChatId, fetchMessages]);

  useEffect(() => {
    if (!chatFeatureEnabled || status !== 'authenticated') {
      if (conversationPollingRef.current) {
        clearInterval(conversationPollingRef.current);
        conversationPollingRef.current = null;
      }
      return;
    }

    const intervalMs = chatOpen ? 6000 : 12000;
    fetchConversations();

    const intervalId = setInterval(() => {
      fetchConversations();
    }, intervalMs);
    conversationPollingRef.current = intervalId;

    return () => {
      clearInterval(intervalId);
      if (conversationPollingRef.current === intervalId) {
        conversationPollingRef.current = null;
      }
    };
  }, [chatFeatureEnabled, status, chatOpen, fetchConversations]);

  useEffect(() => {
    if (!chatFeatureEnabled) {
      return undefined;
    }

    const handleChatClickOutside = (event) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target)) {
        setChatOpen(false);
      }
    };

    const handleChatKeyDown = (event) => {
      if (event.key === 'Escape') {
        setChatOpen(false);
      }
    };

    document.addEventListener('mousedown', handleChatClickOutside);
    document.addEventListener('keydown', handleChatKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleChatClickOutside);
      document.removeEventListener('keydown', handleChatKeyDown);
    };
  }, [chatFeatureEnabled]);

  useEffect(() => {
    if (!chatFeatureEnabled) {
      return;
    }

    if (chatOpen) {
      const timeout = setTimeout(() => {
        chatSearchInputRef.current?.focus();
      }, 20);
      return () => clearTimeout(timeout);
    }

    setChatSearchTerm('');
  }, [chatFeatureEnabled, chatOpen]);

  // Toggle theme
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const toggleChatDropdown = () => {
    setChatOpen((prev) => !prev);
  };

  const openChatForConversation = useCallback(
    ({ conversationId, participantId, participantName }) => {
      if (!chatFeatureEnabled || status !== 'authenticated') {
        return;
      }

      if (!conversationId && !participantId) {
        return;
      }

      const ensureConversation = async () => {
        let resolvedConversationId = conversationId;

        if (!resolvedConversationId && participantId) {
          const existing = chatConversations.find(
            (item) => Number(item.otherParticipantId) === Number(participantId)
          );

          if (existing) {
            resolvedConversationId = existing.id;
          }
        }

        if (!resolvedConversationId && participantId) {
          try {
            const response = await fetch('/api/chat/conversations', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({ participants: [Number(participantId)] }),
            });

            if (!response.ok) {
              throw new Error('Unable to create conversation');
            }

            const data = await response.json();
            resolvedConversationId = data?.conversation?.id;

            if (resolvedConversationId && data?.conversation) {
              setChatConversations((prev) => {
                const exists = prev.some((item) => item.id === resolvedConversationId);
                if (exists) {
                  return prev;
                }
                return [data.conversation, ...prev];
              });
            }
          } catch (error) {
            console.error('Failed to start conversation:', error);
            return;
          }
        }

        if (!resolvedConversationId) {
          return;
        }

        setActiveChatId(resolvedConversationId);
        setChatOpen(true);

        setChatConversations((prev) => {
          const exists = prev.some((item) => item.id === resolvedConversationId);
          if (exists) {
            return prev.map((item) =>
              item.id === resolvedConversationId && participantName
                ? { ...item, otherParticipantName: participantName }
                : item
            );
          }
          return prev;
        });

        setChatHeads((prev) => {
          const exists = prev.some((head) => head.conversationId === resolvedConversationId);
          if (exists) {
            return prev.map((head) =>
              head.conversationId === resolvedConversationId
                ? { ...head, minimized: false }
                : head
            );
          }

          const conversation = chatConversations.find((item) => item.id === resolvedConversationId);
          const displayName =
            participantName ||
            conversation?.otherParticipantName ||
            conversation?.topic ||
            'Conversation';

          return [
            ...prev,
            {
              id: `chat-head-${resolvedConversationId}`,
              conversationId: resolvedConversationId,
              name: displayName,
              preview: conversation?.lastMessagePreview || '',
              minimized: false,
            },
          ];
        });

        if (!chatMessagesById[resolvedConversationId]) {
          fetchMessages(resolvedConversationId);
        }
      };

      ensureConversation();
    },
    [chatFeatureEnabled, status, chatConversations, chatMessagesById, fetchMessages]
  );

  useEffect(() => {
    if (!chatFeatureEnabled) {
      return undefined;
    }

    const handler = (event) => {
      const detail = event?.detail || {};
      openChatForConversation(detail);
    };

    window.addEventListener('sf:openChat', handler);

    return () => {
      window.removeEventListener('sf:openChat', handler);
    };
  }, [chatFeatureEnabled, openChatForConversation]);

  useEffect(() => {
    if (!chatFeatureEnabled || status !== 'authenticated') {
      return undefined;
    }

    const handleChatMessage = (event) => {
      const detail = event?.detail;
      if (!detail) {
        return;
      }

      const rawMessage = detail.message ?? detail;
      const conversationIdValue = detail.conversationId ?? rawMessage?.conversationId;
      const conversationIdNumber = Number(conversationIdValue);
      if (!Number.isFinite(conversationIdNumber) || conversationIdNumber <= 0) {
        return;
      }

      if (!rawMessage?.id) {
        return;
      }

      const message = {
        ...rawMessage,
        conversationId: rawMessage.conversationId ?? conversationIdNumber,
      };

      const isSelfMessage = Number(message.senderId) === Number(sessionUserId);

      const conversationSnapshot = previousChatConversationsRef.current.find(
        (conversation) => conversation.id === conversationIdNumber
      );

      setChatMessagesById((previous) => {
        const currentMessages = previous[conversationIdNumber] ?? [];
        if (currentMessages.some((item) => item.id === message.id)) {
          return previous;
        }

        const optimisticIndex = currentMessages.findIndex(
          (item) =>
            item.optimistic &&
            item.senderId === message.senderId &&
            item.body === message.body
        );

        let nextMessages;
        if (optimisticIndex >= 0) {
          nextMessages = [...currentMessages];
          nextMessages[optimisticIndex] = { ...message };
        } else {
          nextMessages = [...currentMessages, message].sort((a, b) => {
            const aTime = new Date(a.createdAt).getTime();
            const bTime = new Date(b.createdAt).getTime();
            return aTime - bTime;
          });
        }

        return {
          ...previous,
          [conversationIdNumber]: nextMessages,
        };
      });

      setChatMessagesErrors((prev) => ({
        ...prev,
        [conversationIdNumber]: null,
      }));

      let conversationFound = false;
      const isActiveDesktop = Number(activeChatIdRef.current) === conversationIdNumber;
      const isActiveMobile = Number(mobileChatConversationId) === conversationIdNumber;
      const chatVisible =
        (chatOpenRef.current && isActiveDesktop) ||
        (mobileChatOpen && isActiveMobile);

      setChatConversations((prev) => {
        let changed = false;
        const next = prev.map((conversation) => {
          if (conversation.id !== conversationIdNumber) {
            return conversation;
          }

          conversationFound = true;

          const existingUnread = Number(conversation.unreadCount) || 0;
          const nextUnread =
            isSelfMessage || chatVisible ? 0 : existingUnread + 1;

          changed = true;

          return {
            ...conversation,
            lastMessagePreview: message.body,
            lastMessageAt: message.createdAt,
            lastMessageBody: message.body,
            lastMessageId: message.id,
            lastMessageSenderId: message.senderId,
            unreadCount: nextUnread,
          };
        });

        if (!changed) {
          return prev;
        }

        previousChatConversationsRef.current = next;
        return next;
      });

      setChatHeads((prev) => {
        const existingIndex = prev.findIndex(
          (head) => head.conversationId === conversationIdNumber
        );

        if (existingIndex === -1) {
          if (isSelfMessage || !conversationSnapshot) {
            return prev;
          }

          return [
            ...prev,
            {
              id: `chat-head-${conversationIdNumber}`,
              conversationId: conversationIdNumber,
              name:
                conversationSnapshot.otherParticipantName ||
                conversationSnapshot.topic ||
                'Conversation',
              preview: message.body,
              minimized: false,
            },
          ];
        }

        const currentHead = prev[existingIndex];
        const nextHead = {
          ...currentHead,
          preview: message.body,
          minimized:
            !isSelfMessage && !chatVisible ? false : currentHead.minimized,
        };

        if (
          nextHead.preview === currentHead.preview &&
          nextHead.minimized === currentHead.minimized
        ) {
          return prev;
        }

        const next = [...prev];
        next[existingIndex] = nextHead;
        return next;
      });

      lastNotifiedMessageRef.current[conversationIdNumber] = message.id;

      if (!isSelfMessage && chatVisible) {
        markConversationRead(conversationIdNumber);
      } else if (!isSelfMessage && !chatVisible && conversationSnapshot) {
        setRecentIncomingChat({
          conversationId: conversationIdNumber,
          preview: message.body,
          name:
            conversationSnapshot.otherParticipantName ||
            conversationSnapshot.topic ||
            'Conversation',
          timestamp: Date.now(),
          lastMessageId: message.id,
        });
      }

      if (chatVisible) {
        if (isActiveMobile && mobileChatOpen) {
          scheduleScrollToBottom({ behavior: 'smooth', context: 'mobileOverlay' });
        } else if (isActiveDesktop && chatOpenRef.current) {
          scheduleScrollToBottom({ behavior: 'smooth', context: 'messenger' });
        }
      }

      if (!conversationFound) {
        fetchConversations();
      }
    };

    window.addEventListener('sf:chatMessage', handleChatMessage);

    return () => {
      window.removeEventListener('sf:chatMessage', handleChatMessage);
    };
  }, [
    chatFeatureEnabled,
    status,
    sessionUserId,
    markConversationRead,
    fetchConversations,
    scheduleScrollToBottom,
    mobileChatOpen,
    mobileChatConversationId,
  ]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeSearch();
      }
    };

    if (searchOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSearch, searchOpen]);

  useEffect(() => {
    const isSearchContextActive = searchOpen || mobileMenuOpen;

    if (!isSearchContextActive) {
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      executeSearch(searchQuery.trim());
    }, 250);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [executeSearch, mobileMenuOpen, searchOpen, searchQuery]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const { profileSettings } = useProfileSettings();

  const handleSelectConversation = (conversationId) => {
    if (!chatFeatureEnabled) {
      return;
    }
    setActiveChatId(conversationId);
    if (isMobileViewport) {
      setMobileChatConversationId(conversationId);
      setMobileChatOpen(true);
      setChatOpen(false);
    }

    if (conversationId) {
      markConversationRead(conversationId);
      setChatConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: 0 }
            : conversation
        )
      );
    }

    setChatHeads((prev) => {
      const exists = prev.some((head) => head.conversationId === conversationId);
      if (exists) {
        return prev.map((head) =>
          head.conversationId === conversationId
            ? { ...head, minimized: false }
            : head
        );
      }

      const conversation = chatConversations.find((item) => item.id === conversationId);
      if (!conversation) {
        return prev;
      }

      const displayName = conversation.otherParticipantName || conversation.topic || 'Conversation';

      const newHead = {
        id: `chat-head-${conversationId}`,
        conversationId,
        name: displayName,
        preview: conversation.lastMessagePreview,
        minimized: false
      };

      return [...prev, newHead];
    });

    setTimeout(() => {
      if (isMobileViewport) {
        scrollMessagesToBottom({ behavior: 'smooth', context: 'mobileOverlay' });
      } else {
        scrollMessagesToBottom({ behavior: 'smooth', context: 'messenger' });
      }
    }, 50);
  };

  const handleChatSubmit = (event, conversationIdOverride = null) => {
    event.preventDefault();

    if (!chatFeatureEnabled) {
      return;
    }

    const targetConversationId = conversationIdOverride ?? activeChatId;
    if (!targetConversationId) {
      return;
    }

    setActiveChatId(targetConversationId);

    const draft = chatDrafts[targetConversationId]?.trim();
    if (!draft) {
      return;
    }

    const messageBody = draft;
    setChatDrafts((previous) => ({
      ...previous,
      [targetConversationId]: '',
    }));

    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      conversationId: targetConversationId,
      senderId: session?.user?.id,
      senderEmail: userEmail,
      senderName: session?.user?.name || userEmail?.split('@')[0] || 'You',
      body: messageBody,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    setChatMessagesById((previous) => {
      const currentMessages = previous[targetConversationId] ?? [];
      return {
        ...previous,
        [targetConversationId]: [...currentMessages, optimisticMessage],
      };
    });
    setChatHeads((prev) =>
      prev.map((head) =>
        head.conversationId === targetConversationId
          ? { ...head, preview: messageBody, minimized: false }
          : head
      )
    );
    setChatConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === targetConversationId
          ? {
              ...conversation,
              lastMessagePreview: messageBody,
              lastMessageAt: new Date().toISOString(),
            }
          : conversation
      )
    );

    fetch(`/api/chat/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: targetConversationId,
        body: messageBody,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to send message');
        }

        const data = await response.json();
        const savedMessage = data?.message;
        if (!savedMessage) {
          return;
        }

        setChatMessagesById((previous) => {
          const currentMessages = previous[targetConversationId] ?? [];
          return {
            ...previous,
            [targetConversationId]: currentMessages.map((message) =>
              message.id === optimisticMessage.id ? savedMessage : message
            ),
          };
        });

        setChatConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === targetConversationId
              ? {
                  ...conversation,
                  lastMessagePreview: savedMessage.body,
                  lastMessageAt: savedMessage.createdAt,
                  unreadCount: 0,
                }
              : conversation
          )
        );

        setChatHeads((prev) =>
          prev.map((head) =>
            head.conversationId === targetConversationId
              ? { ...head, preview: savedMessage.body }
              : head
          )
        );

        setChatMessagesErrors((previous) => ({
          ...previous,
          [targetConversationId]: null,
        }));
      })
      .catch((error) => {
        console.error('Chat message send error:', error);
        setChatMessagesById((previous) => {
          const currentMessages = previous[targetConversationId] ?? [];
          return {
            ...previous,
            [targetConversationId]: currentMessages.filter(
              (message) => message.id !== optimisticMessage.id
            ),
          };
        });
        setChatMessagesErrors((previous) => ({
          ...previous,
          [targetConversationId]: 'Unable to send message. Please try again.',
        }));
      });
  };

  const toggleChatOptionsMenu = (conversationId) => {
    setChatHeads((prev) =>
      prev.map((head) =>
        head.conversationId === conversationId
          ? { ...head, optionsOpen: !head.optionsOpen }
          : { ...head, optionsOpen: false }
      )
    );
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      const elements = Object.values(chatOptionsMenuRefs.current || {});
      if (elements.some((element) => element && element.contains(event.target))) {
        return;
      }
      setChatHeads((prev) =>
        prev.map((head) =>
          head.optionsOpen ? { ...head, optionsOpen: false } : head
        )
      );
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleCloseChatHead = (conversationId) => {
    if (!chatFeatureEnabled) {
      return;
    }
    setChatHeads((prev) => prev.filter((head) => head.conversationId !== conversationId));

    if (activeChatId === conversationId) {
      const nextActive = chatConversations.find((conversation) =>
        conversation.id !== conversationId
      );
      setActiveChatId(nextActive?.id ?? null);
    }

    if (isMobileViewport && mobileChatConversationId === conversationId) {
      setMobileChatOpen(false);
      setMobileChatConversationId(null);
    }
  };

  const handleToggleChatHead = (conversationId) => {
    if (!chatFeatureEnabled) {
      return;
    }
    if (isMobileViewport) {
      if (mobileChatOpen && mobileChatConversationId === conversationId) {
        setMobileChatOpen(false);
        setMobileChatConversationId(null);
      } else {
        setMobileChatOpen(true);
        setMobileChatConversationId(conversationId);
        setChatOpen(false);
        setActiveChatId(conversationId);
        markConversationRead(conversationId);
        setChatConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation
          )
        );
        setTimeout(() => {
          scrollMessagesToBottom({ behavior: 'smooth', context: 'mobileOverlay' });
        }, 50);
      }
      return;
    }
    setChatHeads((prev) =>
      prev.map((head) =>
        head.conversationId === conversationId
          ? { ...head, minimized: !head.minimized, optionsOpen: false }
          : head
      )
    );

    const nextHead = chatHeads.find((head) => head.conversationId === conversationId);
    const willOpen = !nextHead || nextHead.minimized;
    if (willOpen) {
      setTimeout(() => {
        scrollMessagesToBottom({ behavior: 'smooth', context: 'chatHead', conversationId });
      }, 50);
    }
  };

  const closeMobileChatWindow = () => {
    setMobileChatOpen(false);
    setMobileChatConversationId(null);
  };

  const handleViewProfile = (conversationId) => {
    const conversation = chatConversations.find((item) => item.id === conversationId);
    const targetId = conversation?.otherParticipantId;
    if (!targetId) {
      return;
    }
    router.push(`/users/${targetId}`);
    setChatHeads((prev) =>
      prev.map((head) =>
        head.conversationId === conversationId
          ? { ...head, optionsOpen: false }
          : head
      )
    );
  };

  const handleDeleteConversation = async (conversationId) => {
    setChatHeads((prev) =>
      prev.map((head) =>
        head.conversationId === conversationId
          ? { ...head, deleting: true }
          : head
      )
    );

    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      setChatHeads((prev) => prev.filter((head) => head.conversationId !== conversationId));
      setChatMessagesById((prev) => {
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
      setChatConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));

      if (activeChatId === conversationId) {
        setActiveChatId(null);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    } finally {
      setChatHeads((prev) =>
        prev.map((head) =>
          head.conversationId === conversationId
            ? { ...head, deleting: false, optionsOpen: false }
            : head
        )
      );
    }
  };

  const handleMobileChatSubmit = (event) => {
    if (!mobileChatConversationId) {
      return;
    }
    handleChatSubmit(event, mobileChatConversationId);
  };

  // Check subscription status for premium access
  useEffect(() => {
    let isMounted = true;

    const fetchSubscription = async () => {
      try {
        const response = await fetch('/api/user/subscription', { cache: 'no-store' });
        if (!response.ok) {
          if (isMounted) {
            setHasPremiumAccess(isPremiumUser);
          }
          return;
        }

        const data = await response.json();
        const activeSubscription =
          data?.status === 'active' ||
          data?.hasSubscription === true ||
          data?.plan?.name?.toLowerCase().includes('premium');

        if (isMounted) {
          setHasPremiumAccess(activeSubscription || isPremiumUser);
        }
      } catch (error) {
        console.error('Subscription fetch error:', error);
        if (isMounted) {
          setHasPremiumAccess(isPremiumUser);
        }
      }
    };

    if (status === 'authenticated') {
      fetchSubscription();
    } else if (isMounted) {
      setHasPremiumAccess(false);
    }

    return () => {
      isMounted = false;
    };
  }, [status, isPremiumUser]);

  // Handle FitSavory click
  const handleFitSavoryClick = (e) => {
    e.preventDefault();
    if (status === 'authenticated') {
      if (hasPremiumAccess || isPremiumUser) {
        router.push('/fitsavory');
      } else {
        setShowPricingModal(true);
      }
    } else {
      requireAuth('access FitSavory features');
    }
  };

  // Close mobile menu
  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    closeSearch();
  };

  // Handle sign out
  const resolveSignOutCallbackUrl = () => {
    if (typeof window !== 'undefined' && window?.location?.origin) {
      return `${window.location.origin}/auth/login`;
    }
    return '/auth/login';
  };

  const handleSignOut = async () => {
    try {
      await nextAuthSignOut({ callbackUrl: resolveSignOutCallbackUrl() });
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Show loading state only during initial load
  if (!mounted || (isLoading && !session)) {
    return (
      <>
        <header className="fixed top-0 left-0 z-50 w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="container flex h-20 items-center justify-between">
            <div className="animate-pulse h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="animate-pulse h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </header>
      </>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 shadow-sm">
      <div className="container flex h-20 items-center">
        {/* Logo */}
        <div className="flex items-center gap-2 absolute left-4">
          <Link 
            href="/" 
            className="relative inline-flex items-center justify-center overflow-hidden font-medium transition-all rounded-lg group py-2 px-4 h-11 no-underline hover:no-underline" 
            onClick={closeMobileMenu}
          >
            <ChefHat className="h-6 w-6 text-green-600 dark:group-hover:text-white group-hover:text-white transition-colors duration-300 z-10" />
            <span className="text-2xl md:text-[1.75rem] font-bold bg-gradient-to-r from-green-600 to-green-400 bg-clip-text text-transparent dark:group-hover:text-white group-hover:text-green-700 dark:group-hover:from-white dark:group-hover:to-white group-hover:from-green-700 group-hover:to-green-600 transition-all duration-300 z-10 ml-2">
              SavoryFlavors
            </span>
            <span className="absolute bottom-0 left-0 w-0 h-0 transition-all duration-500 ease-out transform rounded-full bg-green-600 dark:group-hover:bg-green-600 group-hover:bg-green-100 group-hover:w-48 group-hover:h-48 group-hover:-ml-2 group-hover:translate-x-full group-hover:translate-y-full"></span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center justify-center flex-1 space-x-2">
          {[
            { href: "/", label: "Home" },
            { href: "/recipes", label: "Recipes" },
            { href: "/cuisines", label: "Cuisines" },
            { 
              href: "/fitsavory", 
              label: "FitSavory", 
              isSpecial: true, 
              requiresAuth: true,
              onClick: handleFitSavoryClick
            },
            { href: "/favorites", label: "Favorites" },
            { href: "/community", label: "Community" }
          ].map((item) => (
            <div key={item.href}>
              {item.requiresAuth ? (
                <button
                  onClick={(e) => {
                    if (item.onClick) {
                      item.onClick(e);
                    } else if (status === 'authenticated') {
                      window.location.href = item.href;
                    } else {
                      requireAuth('access this feature');
                    }
                  }}
                  className={`
                    relative inline-flex items-center justify-center overflow-hidden font-medium transition-all rounded-lg group py-2 px-4 h-11
                    text-[0.95rem] leading-snug mx-0.5
                    ${item.isSpecial
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg hover:shadow-green-400/30'
                      : 'bg-gray-100 dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:text-green-600 dark:hover:text-green-400'}
                  `}
                >
                  <span className={`absolute bottom-0 left-0 w-0 h-0 transition-all duration-500 ease-out transform rounded-full ${item.isSpecial ? 'bg-emerald-600' : 'bg-green-600'} group-hover:w-48 group-hover:h-48 group-hover:-ml-2 group-hover:translate-x-full group-hover:translate-y-full`}></span>
                  <span className={`relative w-full text-left transition-colors duration-300 ease-in-out font-[500] ${
                    item.isSpecial
                      ? 'group-hover:text-white'
                      : 'group-hover:text-gray-900 dark:group-hover:text-white'
                  }`}>
                    {item.label}
                  </span>
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={`
                    relative inline-flex items-center justify-center overflow-hidden font-medium transition-all rounded-lg group py-2 px-4 h-11
                    text-[0.95rem] leading-snug mx-0.5
                    ${item.isSpecial
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg hover:shadow-green-400/30'
                      : 'bg-gray-100 dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:text-green-600 dark:hover:text-green-400'}
                  `}
                >
                  <span className={`absolute bottom-0 left-0 w-0 h-0 transition-all duration-500 ease-out transform rounded-full ${item.isSpecial ? 'bg-emerald-600' : 'bg-green-600'} group-hover:w-48 group-hover:h-48 group-hover:-ml-2 group-hover:translate-x-full group-hover:translate-y-full`}></span>
                  <span className={`relative w-full text-left transition-colors duration-300 ease-in-out font-[500] ${
                    item.isSpecial
                      ? 'group-hover:text-white'
                      : 'group-hover:text-gray-900 dark:group-hover:text-white'
                  }`}>
                    {item.label}
                  </span>
                </Link>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2 absolute right-4">
          <div className="hidden md:flex" ref={searchMenuRef}>
            <button
              type="button"
              onClick={() => {
                if (searchOpen) {
                  closeSearch();
                } else {
                  openSearch();
                }
              }}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition ${
                searchOpen
                  ? 'bg-green-600 text-white shadow'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800/40 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-expanded={searchOpen}
              aria-haspopup="dialog"
            >
              <Search className="h-4 w-4" />
            </button>

            {searchOpen && (
              <div className="absolute right-0 top-12 z-[70] w-[420px] rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                  <div className="relative flex items-center">
                    <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      placeholder="Search for community members..."
                      className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Type at least 2 characters to search globally.</p>
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {searchLoading ? (
                    <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500 dark:text-gray-300">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Searching users…</span>
                    </div>
                  ) : null}

                  {!searchLoading && searchError ? (
                    <div className="px-3 py-6 text-sm text-rose-500 dark:text-rose-300">
                      {searchError}
                    </div>
                  ) : null}

                  {!searchLoading && !searchError && searchQuery.trim().length >= 2 && !searchResults.length ? (
                    <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400">
                      No users matched “{searchQuery.trim()}”. Try another name or email.
                    </div>
                  ) : null}

                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleSearchSelect(user.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white font-semibold">
                        {user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.image}
                            alt={formatSearchUserName(user)}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          (formatSearchUserName(user)?.[0] || 'S').toUpperCase()
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatSearchUserName(user)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{resolveSearchSubtitle(user)}</p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatSearchStats(user)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {status === 'authenticated' ? (
            <NotificationsBell />
          ) : null}

          {/* Game Controller Button */}
          <button
            className="hidden md:inline-flex p-2 rounded-md hover:bg-accent relative group"
            aria-label="Play Memory Game"
            onClick={() => setShowMemoryGame(true)}
          >
            <Gamepad2 className="h-5 w-5 text-gray-700 dark:text-gray-200 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors" />
          </button>
          
          {/* Memory Game Modal */}
          {showMemoryGame && (
            <MemoryGame onClose={() => setShowMemoryGame(false)} canRecord={status === 'authenticated'} />
          )}

          {/* Messages Button */}
          {status === 'authenticated' && (
            <div className="relative" ref={chatMenuRef}>
              <button
                type="button"
                onClick={toggleChatDropdown}
                className={`p-2 rounded-md relative group ${
                  chatFeatureEnabled
                    ? 'hover:bg-accent'
                    : 'opacity-60 cursor-not-allowed'
                }`}
                aria-label="Open messages"
                aria-haspopup="dialog"
                aria-expanded={chatOpen}
                aria-disabled={!chatFeatureEnabled}
              >
                <MessageCircle className="h-5 w-5 text-gray-700 dark:text-gray-200 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors" />
                {totalUnreadMessages > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white shadow">
                    {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
                  </span>
                ) : null}
              </button>

              {chatOpen && chatFeatureEnabled && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
                    onClick={() => setChatOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="fixed inset-x-4 top-24 z-50 mx-auto w-auto max-w-md max-h-[75vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-[#242526] sm:inset-x-8 sm:max-w-lg md:absolute md:inset-auto md:right-0 md:top-auto md:mt-3 md:mx-0 md:w-[380px] md:max-h-[520px] flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#3a3b3c]">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Messenger</p>
                        <p className="text-xs text-gray-500 dark:text-[#b0b3b8]">
                          Connect with your cooking friends instantly
                        </p>
                      </div>
                      <button
                        type="button"
                        className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:text-[#b0b3b8] dark:hover:bg-[#3a3b3c]"
                        aria-label="Close Messenger"
                        onClick={() => setChatOpen(false)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="px-3 py-2 border-b border-gray-200 dark:border-[#3a3b3c]">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          ref={chatSearchInputRef}
                          type="text"
                          value={chatSearchTerm}
                          onChange={(event) => setChatSearchTerm(event.target.value)}
                          placeholder="Search Messenger"
                          className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-10 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-[#3a3b3c] dark:bg-[#3a3b3c] dark:text-gray-100"
                        />
                        {chatSearchTerm ? (
                          <button
                            type="button"
                            onClick={() => setChatSearchTerm('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:text-[#b0b3b8] dark:hover:bg-[#4e4f50]"
                            aria-label="Clear Messenger search"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[55vh] md:max-h-[420px]">
                      <div className="py-2">
                        {chatConversationsLoading ? (
                          <div className="flex items-center gap-2 px-5 py-4 text-sm text-gray-500 dark:text-[#b0b3b8]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading conversations…</span>
                          </div>
                        ) : null}

                        {chatConversationsError ? (
                          <div className="px-5 py-4 text-sm text-rose-500 dark:text-rose-300">
                            {chatConversationsError}
                          </div>
                        ) : null}

                        {!chatConversationsLoading && !chatConversationsError && filteredChatConversations.length === 0 ? (
                          <div className="px-5 py-4 text-sm text-gray-500 dark:text-[#b0b3b8]">
                            {chatSearchTerm.trim()
                              ? `No matches found for “${chatSearchTerm.trim()}”.`
                              : 'No conversations yet. Start chatting with your friends!'}
                          </div>
                        ) : null}

                        {!chatConversationsLoading && !chatConversationsError && filteredChatConversations.map((conversation) => {
                          const isActive = conversation.id === activeChatId;
                          const displayName = conversation.otherParticipantName || conversation.topic || 'Conversation';
                          const preview = conversation.lastMessagePreview || 'No messages yet';
                          const avatarUrl = conversation.otherParticipantAvatar;
                          const timestamp = formatChatTimestamp(conversation.lastMessageAt);
                          const unreadCount = Number(conversation?.unreadCount || 0);
                          const online = Boolean(
                            conversation?.otherParticipantOnline ??
                            conversation?.online ??
                            conversation?.presence === 'online'
                          );

                          return (
                            <button
                              key={conversation.id}
                              type="button"
                              onClick={() => handleSelectConversation(conversation.id)}
                              className={`relative w-full px-5 py-3 flex items-center gap-3 transition ${
                                isActive
                                  ? 'bg-green-50 dark:bg-[#3a3b3c]'
                                  : 'hover:bg-gray-100 dark:hover:bg-[#3a3b3c]'
                              }`}
                            >
                              <div className="relative">
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    alt={displayName}
                                    className="h-11 w-11 rounded-full object-cover border border-gray-200 dark:border-[#3a3b3c]"
                                  />
                                ) : (
                                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center font-semibold">
                                    {conversation.otherParticipantInitials || displayName.charAt(0)}
                                  </div>
                                )}
                                {online ? (
                                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#242526] bg-green-500"></span>
                                ) : null}
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center justify-between">
                                  <span className={`truncate text-sm font-semibold ${
                                    unreadCount > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-100'
                                  }`}>
                                    {displayName}
                                  </span>
                                  {timestamp ? (
                                    <span className="ml-3 shrink-0 text-[11px] text-gray-400 dark:text-[#b0b3b8]">
                                      {timestamp}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[12px] text-gray-500 dark:text-[#b0b3b8]">
                                  <span className={`truncate ${unreadCount > 0 ? 'font-semibold text-gray-900 dark:text-white' : ''}`}>
                                    {isActive && activeConversationTyping ? 'Typing…' : preview}
                                  </span>
                                  {unreadCount > 0 ? (
                                    <span className="ml-3 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-semibold text-white">
                                      {unreadCount}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!chatFeatureEnabled && chatOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 shadow-xl z-50 p-4 text-sm">
                  <h3 className="font-semibold mb-1">Direct messages coming soon</h3>
                  <p className="text-amber-800/90">
                    Real-time messaging is in development. Stay tuned for updates or join our beta waitlist from the community page.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Subscribe Button */}
          <button
            type="button"
            onClick={() => {
              if (status === 'authenticated') {
                if (isPremiumMember) {
                  router.push('/subscribe?plan=yearly');
                  return;
                }
                router.push('/subscribe');
                return;
              }
              requireAuth('subscribe to premium plans');
            }}
            className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-md bg-olive-600 hover:bg-olive-700 text-white text-sm font-medium transition-colors"
          >
            <Crown className="w-4 h-4" />
            {isPremiumMember ? 'Upgrade' : 'Subscribe'}
          </button>

          {/* Mobile Menu Button */}
          <button
            className="p-2 rounded-full md:hidden hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-gray-700 dark:text-gray-200" />
            ) : (
              <Menu className="h-6 w-6 text-gray-700 dark:text-gray-200" />
            )}
          </button>

          {/* Desktop User Menu */}
          <div className="hidden md:flex items-center gap-2">
            {isLoading ? (
              <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div>
            ) : status === 'authenticated' ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(!userMenuOpen);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  {(profileSettings?.user?.image || profileSettings?.profile?.avatar || session?.user?.image) ? (
                    <img 
                      src={profileSettings?.user?.image || profileSettings?.profile?.avatar || session.user.image} 
                      alt="Profile" 
                      className="w-6 h-6 rounded-full object-cover opacity-90"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                      {session?.user?.name?.charAt(0) || 'U'}
                    </div>
                  )}
                  <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${userMenuOpen ? 'transform rotate-180' : ''}`} />
                </button>
                {userMenuOpen && (
                  <div 
                    className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link
                      href="/profile"
                      className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <User className="w-4 h-4 mr-2" />
                      Profile
                    </Link>
                    {isAdminUser && (
                      <Link
                        href="/admin"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Admin Dashboard
                      </Link>
                    )}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setUserMenuOpen(false);
                        try {
                          await nextAuthSignOut({ 
                            redirect: true,
                            callbackUrl: resolveSignOutCallbackUrl() 
                          });
                          // Force a full page reload to ensure all session data is cleared
                          router.refresh();
                        } catch (error) {
                          console.error('Error during sign out:', error);
                          window.location.href = '/auth/login';
                        }
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-green-600 dark:hover:text-green-400 transition-colors"
              >
                <LogIn className="w-4 h-4 mr-1" />
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-all duration-300 ease-in-out md:hidden ${
          mobileMenuOpen ? 'opacity-100 visible' : 'invisible'
        }`}
        onClick={closeMobileMenu}
      >
        <div
          className={`fixed right-0 top-0 h-full w-4/5 max-w-sm bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl transform transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col h-full p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                  <ChefHat className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-green-600 to-green-400 bg-clip-text text-transparent">
                  SavoryFlavors
                </span>
              </div>
              <button
                onClick={closeMobileMenu}
                className="p-2 -mr-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-8">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="mobile-global-search"
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search for community members"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={closeSearch}
                    className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Type at least 2 characters to search globally.
              </p>

              <div className="mt-4 max-h-72 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                {searchLoading ? (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-500 dark:text-gray-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Searching users…</span>
                  </div>
                ) : null}

                {!searchLoading && searchError ? (
                  <div className="px-3 py-6 text-sm text-rose-500 dark:text-rose-300">
                    {searchError}
                  </div>
                ) : null}

                {!searchLoading && !searchError && searchQuery.trim().length >= 2 && !searchResults.length ? (
                  <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400">
                    No users matched “{searchQuery.trim()}”. Try another name or email.
                  </div>
                ) : null}

                {!searchQuery.trim() && !searchLoading && !searchError && !searchResults.length ? (
                  <div className="px-3 py-6 text-sm text-gray-400 dark:text-gray-500">
                    Start typing to find community members.
                  </div>
                ) : null}

                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSearchSelect(user.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white font-semibold">
                      {user.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.image}
                          alt={formatSearchUserName(user)}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        (formatSearchUserName(user)?.[0] || 'S').toUpperCase()
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatSearchUserName(user)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{resolveSearchSubtitle(user)}</p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatSearchStats(user)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </button>
                ))}
              </div>
            </div>

            <nav className="flex-1 space-y-2">
              {[
                { href: "/", label: "Home", icon: Home },
                { href: "/recipes", label: "Recipes", icon: ClipboardList },
                { href: "/cuisines", label: "Cuisines", icon: ChefHat },
                { href: "/favorites", label: "Favorites", icon: Heart, requiresAuth: true },
                { href: "/community", label: "Community", icon: MessageCircle },
                { href: "/pricing", label: "Plans & Pricing", icon: Crown },
                { href: "/about", label: "About", icon: Info },
                {
                  href: "#memory-game",
                  label: "Play Memory Game",
                  icon: Gamepad2,
                  onClick: (event) => {
                    event.preventDefault();
                    closeMobileMenu();
                    setShowMemoryGame(true);
                  }
                },
                {
                  href: "/fitsavory",
                  label: "FitSavory",
                  icon: Sparkles,
                  isSpecial: true,
                  requiresAuth: true,
                  onClick: (e) => {
                    e.preventDefault();
                    closeMobileMenu();
                    if (status === 'authenticated') {
                      if (hasPremiumAccess || isPremiumUser) {
                        router.push('/fitsavory');
                      } else {
                        setShowPricingModal(true);
                      }
                    } else {
                      requireAuth('access FitSavory features');
                    }
                  }
                }
              ].map((item) => {
                const Icon = item.icon ?? ArrowRight;

                const sharedProps = {
                  className: `
                        relative inline-flex w-full items-center gap-3 overflow-hidden rounded-xl border border-transparent bg-gray-100/80 py-3 px-5 text-left text-base font-medium text-gray-700 transition-all duration-200 hover:bg-green-600 hover:text-white dark:bg-gray-800/40 dark:text-gray-200 dark:hover:bg-green-500/80 dark:hover:text-white
                        ${item.isSpecial ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-md hover:from-green-600 hover:to-emerald-600 dark:from-emerald-500 dark:to-green-500' : ''}
                      `,
                  children: (
                    <span className="relative flex items-center gap-3">
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.isSpecial ? 'bg-white/20 text-white' : 'bg-white text-green-600 dark:bg-gray-900 dark:text-green-400'}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      <ChevronRight className="h-4 w-4 opacity-60" />
                    </span>
                  )
                };

                if (item.requiresAuth) {
                  return (
                    <div key={item.href}>
                      <button
                        onClick={(e) => {
                          if (item.onClick) {
                            item.onClick(e);
                          } else if (status === 'authenticated') {
                            closeMobileMenu();
                            router.push(item.href);
                          } else {
                            requireAuth('access this feature');
                            closeMobileMenu();
                          }
                        }}
                        className={sharedProps.className}
                      >
                        {sharedProps.children}
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={item.href}>
                    <Link
                      href={item.href || '#'}
                      onClick={(event) => {
                        if (item.onClick) {
                          item.onClick(event);
                        } else {
                          closeMobileMenu();
                        }
                      }}
                      className={sharedProps.className}
                    >
                      {sharedProps.children}
                    </Link>
                  </div>
                );
              })}
            </nav>

            <div className="pt-6 mt-auto space-y-3 border-t border-gray-200 dark:border-gray-800">
              {session ? (
                <>
                  <Link
                    href="/profile"
                    onClick={closeMobileMenu}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    View Profile
                  </Link>
                  <button
                    onClick={() => {
                      closeMobileMenu();
                      handleSignOut();
                    }}
                    className="w-full py-3 px-4 text-center text-base font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    onClick={closeMobileMenu}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-olive-500 px-4 py-3 text-sm font-semibold text-olive-600 transition-colors hover:bg-olive-50 dark:border-olive-400 dark:text-olive-300 dark:hover:bg-olive-500/20"
                  >
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Link>
                  <button
                    onClick={() => {
                      window.location.href = '/';
                      closeMobileMenu();
                    }}
                    className="w-full py-3 px-4 text-center text-base font-semibold text-white bg-olive-600 hover:bg-olive-700 rounded-lg transition-colors"
                  >
                    <Utensils className="w-4 h-4 inline mr-2" />
                    Continue as Guest
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile Chat Window */}
      {status === 'authenticated' && isMobileViewport && mobileChatOpen && mobileChatConversationId && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden"
            onClick={closeMobileChatWindow}
            aria-hidden="true"
          />
          <div className="fixed top-20 right-3 z-50 w-[min(92vw,360px)] max-h-[75vh] md:hidden flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#3a3b3c] dark:bg-[#242526]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-[#3a3b3c]">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {mobileChatHead?.name || 'Conversation'}
                </p>
                <p className="text-xs text-gray-500 dark:text-[#b0b3b8]">
                  {mobileConversationTyping
                    ? 'Typing…'
                    : mobileOtherParticipantOnline
                    ? 'Active now'
                    : 'Messenger chat'}
                </p>
              </div>
              <div className="flex items-center gap-1 text-gray-500 dark:text-[#b0b3b8]">
                <button
                  type="button"
                  className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#3a3b3c]"
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#3a3b3c]" />
                <button
                  type="button"
                  onClick={closeMobileChatWindow}
                  className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#3a3b3c]"
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={mobileOverlayMessagesContainerRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            >
              {isMobileChatLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500 dark:text-[#b0b3b8]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading messages…</span>
                </div>
              ) : null}

              {mobileChatError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                  {mobileChatError}
                </div>
              ) : null}

              {!isMobileChatLoading && !mobileChatError && mobileMessages.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500 dark:text-[#b0b3b8]">
                  No messages yet. Say hello!
                </p>
              ) : null}

              {mobileMessages.map((message) => {
                const senderEmail = message?.senderEmail?.toLowerCase();
                const isOwnMessage = senderEmail
                  ? senderEmail === userEmail
                  : message?.senderId === session?.user?.id;
                const messageText = message?.body || message?.text || '';
                const messageTimestamp = formatChatTimestamp(message?.createdAt) || 'Just now';
                const messageId = message?.id ?? message?.clientId ?? message?.createdAt ?? `${messageText}-${messageTimestamp}`;
                const isReadIndicatorVisible = Boolean(
                  isOwnMessage && mobileLastOwnMessageReadId && mobileLastOwnMessageReadId === message?.id
                );

                return (
                  <div key={messageId} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className="flex items-end gap-2 max-w-full">
                      {!isOwnMessage ? (
                        mobileAvatarUrl ? (
                          <img
                            src={mobileAvatarUrl}
                            alt={mobileChatHead?.name || 'User avatar'}
                            className="h-7 w-7 rounded-full object-cover border border-gray-200 dark:border-[#3a3b3c]"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center text-[10px] font-semibold">
                            {mobileInitials}
                          </div>
                        )
                      ) : null}
                      <div
                        className={`max-w-[240px] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          isOwnMessage
                            ? 'bg-[#0084ff] text-white rounded-br-sm'
                            : 'bg-white dark:bg-[#3a3b3c] text-gray-900 dark:text-white rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-5 break-words">{messageText}</p>
                        <div
                          className={`mt-1 flex items-center gap-2 text-[10px] ${
                            isOwnMessage ? 'justify-end text-white/80' : 'justify-start text-gray-500 dark:text-[#b0b3b8]'
                          }`}
                        >
                          <span>{messageTimestamp}</span>
                          {isReadIndicatorVisible ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCheck className="h-3 w-3" />
                              Seen
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {mobileConversationTyping ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#b0b3b8]">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center text-[10px] font-semibold">
                    {mobileInitials}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex -space-x-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-[#b0b3b8] animate-bounce [animation-delay:-0.2s]"></span>
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-[#b0b3b8] animate-bounce"></span>
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-[#b0b3b8] animate-bounce [animation-delay:0.2s]"></span>
                    </span>
                    <span>Typing…</span>
                  </div>
                </div>
              ) : null}
            </div>

            <form onSubmit={handleMobileChatSubmit} className="border-t border-gray-200 bg-white px-3 py-2 dark:border-[#3a3b3c] dark:bg-[#18191a]">
              <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 dark:bg-[#3a3b3c]">
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-700 dark:text-[#b0b3b8] dark:hover:text-white"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  value={mobileChatDraft}
                  onFocus={() => setActiveChatId(mobileChatConversationId)}
                  onChange={(event) =>
                    setChatDrafts((previous) => ({
                      ...previous,
                      [mobileChatConversationId]: event.target.value,
                    }))
                  }
                  className="flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none dark:text-white"
                  placeholder={`Message ${(mobileChatHead?.name || 'friend').split(' ')[0]}...`}
                />
                <button
                  type="submit"
                  className={`inline-flex items-center justify-center rounded-full bg-[#16a34a] p-2 text-white transition-colors hover:bg-[#15803d] dark:bg-[#22c55e] dark:hover:bg-[#16a34a] ${
                    mobileChatDraft.trim() ? '' : 'cursor-not-allowed opacity-50'
                  }`}
                  disabled={!mobileChatDraft.trim()}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Chat Heads (Mobile bubble) */}
      {status === 'authenticated' && isMobileViewport && chatHeads.length > 0 && (
        <div className="md:hidden fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3">
          {chatHeads.map((head) => {
            const conversation = chatConversations.find((item) => item.id === head.conversationId);
            const unreadCount = Number(conversation?.unreadCount || 0);
            const avatarUrl = conversation?.otherParticipantAvatar;
            const initials = head.name
              ?.split(' ')
              .filter(Boolean)
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() || 'U';

            return (
              <div key={head.id} className="relative flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleToggleChatHead(head.conversationId)}
                  aria-label={`Toggle chat with ${head.name}`}
                  className={`h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-[#16a34a] text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/60 dark:bg-[#22c55e] dark:text-[#0b2512] dark:border-emerald-400 ${
                    mobileChatOpen && mobileChatConversationId === head.conversationId ? 'ring-2 ring-[#16a34a] dark:ring-[#22c55e]' : ''
                  }`}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={head.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-base font-semibold">{initials}</span>
                  )}
                </button>
                <span className="mt-1 max-w-[88px] truncate text-xs text-gray-600 dark:text-gray-200">
                  {head.name.split(' ')[0] || head.name}
                </span>
                {unreadCount > 0 ? (
                  <span className="absolute -bottom-1 right-1 inline-flex items-center justify-center rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Chat Heads (Desktop) */}
      {status === 'authenticated' && chatHeads.length > 0 && (
        <div className="hidden md:flex fixed bottom-4 right-4 z-[60] items-end gap-4">
          <div className="flex flex-row-reverse items-end gap-3">
            {chatHeads
              .filter((head) => !head.minimized)
              .map((head) => {
                const conversation = chatConversations.find((item) => item.id === head.conversationId);
                const messages = chatMessagesById[head.conversationId] ?? [];
                const draft = chatDrafts[head.conversationId] ?? '';
                const isLoadingMessages = Boolean(chatMessagesLoadingIds[head.conversationId]);
                const messageError = chatMessagesErrors[head.conversationId];
                const avatarUrl = conversation?.otherParticipantAvatar;
                const initials = head.name
                  ?.split(' ')
                  .filter(Boolean)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || 'U';
                const otherParticipantOnline = Boolean(
                  conversation?.otherParticipantOnline ??
                    conversation?.online ??
                    conversation?.presence === 'online'
                );
                const conversationTyping = Boolean(
                  conversation?.otherParticipantTyping ??
                    conversation?.isTyping ??
                    conversation?.typing
                );

                let lastOwnMessageWithReadReceipt = null;
                for (let index = messages.length - 1; index >= 0; index -= 1) {
                  const message = messages[index];
                  const senderEmail = message?.senderEmail?.toLowerCase();
                  const isOwnMessage = senderEmail
                    ? senderEmail === userEmail
                    : message?.senderId === session?.user?.id;

                  if (isOwnMessage) {
                    const readTimestamp =
                      message?.readAt ||
                      message?.seenAt ||
                      message?.readTimestamp ||
                      (message?.read === true ? message?.updatedAt || message?.createdAt : null);

                    if (readTimestamp) {
                      lastOwnMessageWithReadReceipt = {
                        id: message.id,
                        timestamp: readTimestamp,
                      };
                      break;
                    }
                  }
                }

                return (
                  <div
                    key={head.id}
                    className="w-80 rounded-2xl bg-white shadow-2xl border border-gray-200 dark:bg-[#242526] dark:border-[#3a3b3c] overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-[#3a3b3c]">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center text-sm font-semibold">
                            {initials}
                          </div>
                          {otherParticipantOnline ? (
                            <span className="absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-gray-100 dark:border-[#3a3b3c] bg-green-500"></span>
                          ) : null}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{head.name}</span>
                          <span className="text-xs text-gray-500 dark:text-[#b0b3b8]">
                            {conversationTyping ? 'Typing…' : otherParticipantOnline ? 'Active now' : 'Last active recently'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 dark:text-[#b0b3b8]" ref={(element) => {
                        if (!element) {
                          delete chatOptionsMenuRefs.current[head.conversationId];
                          return;
                        }
                        chatOptionsMenuRefs.current[head.conversationId] = element;
                      }}>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => toggleChatOptionsMenu(head.conversationId)}
                            className={`p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#4e4f50] ${head.deleting ? 'pointer-events-none opacity-60' : ''}`}
                            aria-label="More options"
                            aria-haspopup="menu"
                            aria-expanded={Boolean(head.optionsOpen)}
                          >
                            <MoreHorizontal className={`h-4 w-4 ${head.optionsOpen ? 'text-olive-600 dark:text-emerald-400' : ''}`} />
                          </button>
                          {head.optionsOpen ? (
                            <div className="absolute right-0 mt-2 w-40 rounded-xl border border-gray-200 bg-white py-2 text-sm shadow-xl dark:border-[#4e4f50] dark:bg-[#2d2f34]">
                              <button
                                type="button"
                                onClick={() => handleViewProfile(head.conversationId)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-gray-100 dark:hover:bg-[#3a3c42]"
                              >
                                <User className="h-4 w-4" />
                                View profile
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteConversation(head.conversationId)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                disabled={head.deleting}
                              >
                                <Trash2 className="h-4 w-4" />
                                {head.deleting ? 'Deleting…' : 'Delete conversation'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <span className="w-px h-5 bg-gray-200 dark:bg-[#4e4f50] mx-1"></span>
                        <button
                          type="button"
                          onClick={() => handleToggleChatHead(head.conversationId)}
                          className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#4e4f50]"
                          aria-label="Minimize chat"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseChatHead(head.conversationId)}
                          className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#4e4f50]"
                          aria-label="Close chat"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col h-80 bg-gray-50 dark:bg-[#18191a]">
                      <div
                        ref={(element) => {
                          const refObject = getChatHeadContainerRef(head.conversationId);
                          if (refObject) {
                            refObject.desktop = element;
                          }
                        }}
                        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
                      >
                        {isLoadingMessages ? (
                          <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500 dark:text-[#b0b3b8]">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading messages…</span>
                          </div>
                        ) : null}

                        {messageError ? (
                          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-200">
                            {messageError}
                          </div>
                        ) : null}

                        {!isLoadingMessages && !messageError && messages.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-[#b0b3b8] text-center">
                            No messages yet. Say hello!
                          </p>
                        ) : null}

                        {messages.map((message) => {
                          const senderEmail = message.senderEmail?.toLowerCase();
                          const isOwnMessage = senderEmail
                            ? senderEmail === userEmail
                            : message.senderId === session?.user?.id;
                          const messageText = message.body || message.text || '';
                          const messageTimestamp = formatChatTimestamp(message.createdAt) || 'Just now';
                          const isReadIndicatorVisible = Boolean(
                            isOwnMessage && lastOwnMessageWithReadReceipt && lastOwnMessageWithReadReceipt.id === message.id
                          );

                          return (
                            <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                              <div className="flex items-end gap-2 max-w-full">
                                {!isOwnMessage ? (
                                  avatarUrl ? (
                                    <img
                                      src={avatarUrl}
                                      alt={head.name}
                                      className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-[#3a3b3c]"
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center text-[10px] font-semibold">
                                      {initials}
                                    </div>
                                  )
                                ) : null}
                                <div
                                  className={`max-w-[220px] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                    isOwnMessage
                                      ? 'bg-[#16a34a] text-white rounded-br-sm dark:bg-[#22c55e] dark:text-[#0b2512]'
                                      : 'bg-white dark:bg-[#1f2933] text-gray-900 dark:text-[#e0f2f1] rounded-bl-sm'
                                  }`}
                                >
                                  <p className="whitespace-pre-wrap leading-5 break-words">{messageText}</p>
                                  <div
                                    className={`mt-1 flex items-center gap-2 text-[10px] ${
                                      isOwnMessage
                                        ? 'justify-end text-white/80'
                                        : 'justify-start text-gray-500 dark:text-[#b0b3b8]'
                                    }`}
                                  >
                                    <span>{messageTimestamp}</span>
                                    {isReadIndicatorVisible ? (
                                      <span className="inline-flex items-center gap-1">
                                        <CheckCheck className="h-3 w-3" />
                                        Seen
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {conversationTyping ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#b0b3b8]">
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 text-white flex items-center justify-center text-[10px] font-semibold">
                              {initials}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="inline-flex -space-x-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-[#b0b3b8] animate-bounce [animation-delay:-0.2s]"></span>
                                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-[#b0b3b8] animate-bounce"></span>
                                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-[#b0b3b8] animate-bounce [animation-delay:0.2s]"></span>
                              </span>
                              <span>Typing…</span>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <form
                        onSubmit={(event) => handleChatSubmit(event, head.conversationId)}
                        className="px-3 py-2 border-t border-gray-200 bg-white dark:border-[#3a3b3c] dark:bg-[#242526]"
                      >
                        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5 dark:bg-[#3a3b3c]">
                          <button
                            type="button"
                            className="text-gray-500 hover:text-gray-700 dark:text-[#b0b3b8] dark:hover:text-white"
                            aria-label="Attach file"
                          >
                            <Paperclip className="h-4 w-4" />
                          </button>
                          <input
                            type="text"
                            value={draft}
                            onFocus={() => setActiveChatId(head.conversationId)}
                            onChange={(event) =>
                              setChatDrafts((previous) => ({
                                ...previous,
                                [head.conversationId]: event.target.value,
                              }))
                            }
                            className="flex-1 bg-transparent border-none text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none dark:text-white"
                            placeholder={`Message ${head.name.split(' ')[0] || head.name}...`}
                          />
                          <button
                            type="submit"
                            className={`inline-flex items-center justify-center rounded-full bg-[#16a34a] hover:bg-[#15803d] text-white p-2 transition-colors dark:bg-[#22c55e] dark:text-[#0b2512] dark:hover:bg-[#16a34a] ${
                              draft.trim() ? '' : 'opacity-50 cursor-not-allowed'
                            }`}
                            disabled={!draft.trim()}
                            aria-label="Send message"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="flex flex-col-reverse items-center gap-2 pr-1">
            {chatHeads
              .filter((head) => head.minimized)
              .map((head) => {
                const conversation = chatConversations.find((item) => item.id === head.conversationId);
                const unreadCount = Number(conversation?.unreadCount || 0);
                const avatarUrl = conversation?.otherParticipantAvatar;
                const initials = head.name
                  ?.split(' ')
                  .filter(Boolean)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || 'U';

                return (
                  <div key={head.id} className="relative flex flex-col items-center">
                    <button
                      type="button"
                      title={head.name}
                      onClick={() => {
                        setActiveChatId(head.conversationId);
                        handleToggleChatHead(head.conversationId);
                      }}
                      className="w-14 h-14 rounded-full bg-[#16a34a] text-white shadow-lg border-2 border-white dark:bg-[#22c55e] dark:text-[#0b2512] dark:border-emerald-400 flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/60 dark:focus:ring-[#22c55e]/60 overflow-hidden"
                      aria-label={`Open chat with ${head.name}`}
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={head.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-semibold">{initials}</span>
                      )}
                    </button>
                    <span className="mt-1 text-xs text-gray-600 dark:text-gray-300 text-center max-w-[88px] truncate">
                      {head.name.split(' ')[0] || head.name}
                    </span>
                    {unreadCount > 0 ? (
                      <span className="absolute -bottom-1 right-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white bg-blue-500 rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleCloseChatHead(head.conversationId)}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-200/90 text-gray-700 flex items-center justify-center text-[10px] shadow hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-100"
                      aria-label={`Close chat with ${head.name}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Pricing Modal */}
      {showPricingModal && (
        <div className="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="pricing-modal-title" role="dialog" aria-modal="true">
          <div className="flex min-h-screen items-center justify-center p-4 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 bg-gray-500/75 transition-opacity" 
              aria-hidden="true" 
              onClick={() => setShowPricingModal(false)}
            ></div>
            
            <div className="inline-block w-full max-w-6xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 text-left align-middle shadow-xl transition-all sm:my-8 sm:w-full">
              <div className="relative">
                <button
                  type="button"
                  className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setShowPricingModal(false)}
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </button>
                
                <div className="p-6 sm:p-8">
                  <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                      Choose Your Plan
                    </h2>
                    <p className="mt-3 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                      Unlock all features and start cooking smarter with FitSavory. Select the plan that works best for you.
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Basic Plan */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col h-full">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Basic</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-4">Essential features for home cooks</p>
                        <div className="flex items-baseline mb-6">
                          <span className="text-3xl font-bold text-gray-900 dark:text-white">₱0</span>
                          <span className="ml-1 text-gray-500 dark:text-gray-400">/month</span>
                        </div>
                        <ul className="space-y-3 mb-6">
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Browse all public recipes</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Post in community</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Create and share recipes</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Basic support via email</span>
                          </li>
                        </ul>
                      </div>
                      <button
                        onClick={() => {
                          setShowPricingModal(false);
                          router.push('/fitsavory?trial=true');
                        }}
                        className="w-full mt-auto py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                      >
                        Start Free
                      </button>
                    </div>
                    
                    {/* Premium Monthly */}
                    <div className="rounded-xl border-2 border-olive-600 bg-olive-100/80 dark:bg-gray-800 p-6 flex flex-col h-full transform scale-105 relative">
                      <div className="absolute top-0 right-0 bg-olive-700 text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                        POPULAR
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Premium</h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-4">Unlock all features including recipe monetization</p>
                        <div className="flex items-baseline mb-6">
                          <span className="text-3xl font-bold text-gray-800 dark:text-white">₱199</span>
                          <span className="ml-1 text-gray-700 dark:text-gray-300">/month</span>
                        </div>
                        <ul className="space-y-3 mb-6">
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">All Basic features</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Access to FitSavory</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Save unlimited favorite recipes</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Sell your own recipes</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Priority 24/7 support</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Ad-free experience</span>
                          </li>
                        </ul>
                      </div>
                      <button
                        onClick={() => {
                          setShowPricingModal(false);
                          router.push('/subscribe?plan=premium_monthly');
                        }}
                        className="w-full mt-auto py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-olive-600 hover:bg-olive-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-olive-500"
                      >
                        Get Started
                      </button>
                    </div>
                    
                    {/* Premium Yearly */}
                    <div className="rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-6 flex flex-col h-full">
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Premium Yearly</h3>
                            <p className="text-gray-600 dark:text-gray-300 mb-4">Best value - Get 2 months free</p>
                          </div>
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-800/30 dark:text-amber-200">
                            BEST VALUE
                          </span>
                        </div>
                        <div className="flex items-baseline mb-6">
                          <span className="text-3xl font-bold text-gray-900 dark:text-white">₱1,990</span>
                          <span className="ml-1 text-gray-600 dark:text-gray-400">/year</span>
                        </div>
                        <div className="mb-4">
                          <span className="inline-block px-2 py-1 text-xs font-semibold text-amber-800 bg-amber-100 rounded-full dark:bg-amber-900/30 dark:text-amber-200">
                            Save 17% (₱398)
                          </span>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            Only ₱166/month
                          </p>
                        </div>
                        <ul className="space-y-3 mb-6">
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">All Premium Monthly features</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Save ₱398 vs monthly</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Priority customer support</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Early access to new features</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Exclusive content</span>
                          </li>
                          <li className="flex items-start">
                            <svg className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-gray-800 dark:text-gray-200">Yearly member badge</span>
                          </li>
                        </ul>
                      </div>
                      <button
                        onClick={() => {
                          setShowPricingModal(false);
                          router.push('/subscribe?plan=premium_yearly');
                        }}
                        className="w-full mt-auto py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
                      >
                        Get Best Value
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    <p>Cancel anytime. No questions asked. 30-day money-back guarantee.</p>
                    <p className="mt-2">Need help deciding? <a href="#" className="text-olive-600 hover:text-olive-800 dark:text-olive-400 dark:hover:text-olive-300 font-medium">Contact our support team</a></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}