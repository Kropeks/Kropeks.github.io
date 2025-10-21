import Link from 'next/link';
import { cookies } from 'next/headers';

import ImageWithFallback from '@/components/ImageWithFallback';
import ExternalPostFeed from './ExternalPostFeed';
import ProfileTabs from './ProfileTabs';
import MessageUserButton from './MessageUserButton';
import FollowUserButton from './FollowUserButton';
import ReportUserButton from './ReportUserButton';
import {
  ShieldCheck,
  MapPin,
  TrendingUp,
  Clock,
  Users,
  BookOpen,
  Share2,
  BadgeCheck,
  Sparkles
} from 'lucide-react';

const resolveBaseUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    if (vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')) {
      return vercelUrl.replace(/\/$/, '');
    }
    return `https://${vercelUrl}`;
  }

  return '';
};

const RecipeGallery = ({ recipes }) => {
  if (!recipes.length) {
    return (
      <div className="rounded-3xl border border-dashed border-olive-200 bg-white/70 p-10 text-center text-sm text-olive-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
        This chef hasn’t published public recipes yet. Follow along to be the first to taste what’s next!
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {recipes.map((recipe) => (
        <Link
          key={recipe.id}
          href={`/recipes/${encodeURIComponent(recipe.slug ?? recipe.id)}`}
          className="group overflow-hidden rounded-3xl border border-olive-100 bg-white/80 shadow-sm ring-1 ring-olive-100/80 transition hover:-translate-y-1 hover:border-emerald-400 hover:shadow-xl dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            <ImageWithFallback
              src={recipe.image}
              alt={recipe.title || 'Recipe image'}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              fallback="/placeholder-recipe.jpg"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-70 group-hover:opacity-100" />
            <div className="absolute bottom-0 left-0 right-0 space-y-2 p-4 text-white">
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/70">Signature Dish</p>
              <h3 className="text-lg font-semibold leading-tight">{recipe.title || 'Untitled recipe'}</h3>
            </div>
          </div>
          <div className="space-y-3 px-5 py-4 text-sm text-olive-600 dark:text-gray-300">
            <p className="line-clamp-2 text-olive-600/90 dark:text-gray-400">
              {recipe.description || 'Visit the recipe to uncover the full story behind this dish.'}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-olive-500 dark:text-gray-400">
              {recipe.category && (
                <span className="rounded-full bg-emerald-100/70 px-3 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {recipe.category}
                </span>
              )}
              {recipe.cuisine && <span>{recipe.cuisine}</span>}
              {(Number(recipe.prepTime) || Number(recipe.cookTime)) ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {(() => {
                    const prep = Number.isFinite(recipe.prepTime) ? recipe.prepTime : 0;
                    const cook = Number.isFinite(recipe.cookTime) ? recipe.cookTime : 0;
                    const total = prep + cook;
                    if (total) {
                      return `${total} min`;
                    }
                    return `${prep || cook} min`;
                  })()}
                </span>
              ) : null}
              {recipe.createdAt && <span>{formatDate(recipe.createdAt)}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};

const AboutCard = ({ user, joinedLabel }) => (
  <div className="space-y-4 rounded-3xl border border-olive-100 bg-white/80 p-6 shadow-sm ring-1 ring-olive-100/80 dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800">
    <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-olive-500 dark:text-emerald-300/80">
      <BadgeCheck className="h-4 w-4" />
      <span>About</span>
    </div>
    <div className="space-y-4 text-sm text-olive-600 dark:text-gray-300">
      {user.bio ? <p className="text-base leading-relaxed text-olive-700 dark:text-gray-100">{user.bio}</p> : <p className="text-olive-500 dark:text-gray-400">This member hasn’t written a bio yet. Check back soon to learn more about their culinary journey.</p>}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-3">
          <BookOpen className="h-4 w-4 text-emerald-500" />
          <span className="text-olive-700 dark:text-gray-200 font-semibold">{user.recipeCount} public recipes crafted</span>
        </div>
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-emerald-500" />
          <span className="text-olive-700 dark:text-gray-200 font-semibold">Community conversations sparked: {user.postCount}</span>
        </div>
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-emerald-500" />
          <span className="text-olive-700 dark:text-gray-200 font-semibold">
            {user.followerCount.toLocaleString()} follower{user.followerCount === 1 ? '' : 's'} · Following {user.followingCount.toLocaleString()}
          </span>
        </div>
        {user.location ? (
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-emerald-500" />
            <span>{user.location}</span>
          </div>
        ) : null}
        {joinedLabel ? (
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-emerald-500" />
            <span>Member since {joinedLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/community?user=${user.id}`}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-emerald-600"
        >
          <Share2 className="h-3.5 w-3.5" />
          Community Feed
        </Link>
        <Link
          href={`mailto:${user.email}`}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-600 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/10"
        >
          Contact
        </Link>
      </div>
    </div>
  </div>
);

const HighlightCard = ({ title, description, icon: Icon, tone = 'emerald' }) => {
  const toneClass = tone === 'emerald'
    ? 'from-emerald-500 to-green-500 text-white'
    : 'from-amber-500 to-orange-500 text-white';

  return (
    <div className={`overflow-hidden rounded-3xl bg-gradient-to-br ${toneClass} p-5 shadow-lg`}> 
      <div className="flex items-center gap-3 text-sm uppercase tracking-[0.35em] text-white/80">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        <span>{title}</span>
      </div>
      <p className="mt-3 text-sm font-medium leading-relaxed text-white/90">{description}</p>
    </div>
  );
};

const SocialPresenceCard = ({ recipes }) => {
  const [latest, next, third] = recipes;
  return (
    <div className="space-y-4 rounded-3xl border border-olive-100 bg-white/80 p-6 shadow-sm ring-1 ring-olive-100/80 dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800">
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-olive-500 dark:text-emerald-300/80">
        <Sparkles className="h-4 w-4" />
        <span>Spotlight</span>
      </div>
      <p className="text-sm text-olive-600 dark:text-gray-300">Catch their most talked-about creations.</p>
      <div className="space-y-3">
        {latest ? <RecipeStrip recipe={latest} /> : <p className="text-sm text-olive-500 dark:text-gray-400">No highlights yet—once they publish a dish, it will shine here.</p>}
        {next ? <RecipeStrip recipe={next} /> : null}
        {third ? <RecipeStrip recipe={third} /> : null}
      </div>
    </div>
  );
};

const fetchProfile = async (userId, { recipesLimit = 8, postsLimit = 6 } = {}, cookieHeader) => {
  const params = new URLSearchParams();
  if (recipesLimit) {
    params.set('recipesLimit', recipesLimit);
  }
  if (postsLimit) {
    params.set('postsLimit', postsLimit);
  }

  const baseUrl = resolveBaseUrl();
  const url = new URL(`/api/users/${userId}`, baseUrl);
  url.search = params.toString();

  const headers = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
};

const formatDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

const RecipeStrip = ({ recipe }) => {
  const prep = Number.isFinite(recipe.prepTime) ? recipe.prepTime : null;
  const cook = Number.isFinite(recipe.cookTime) ? recipe.cookTime : null;

  return (
    <Link
      href={`/recipes/${encodeURIComponent(recipe.slug ?? recipe.id)}`}
      className="group flex items-center gap-4 rounded-2xl border border-olive-100 bg-white/60 px-4 py-3 shadow-sm ring-1 ring-olive-100/70 transition hover:-translate-y-0.5 hover:border-olive-200 hover:bg-white hover:shadow-md dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800 dark:hover:border-gray-700"
    >
      <div className="relative aspect-[4/3] w-28 overflow-hidden rounded-xl bg-olive-100">
        <ImageWithFallback
          src={recipe.image}
          alt={recipe.title || 'Recipe image'}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          fallback="/placeholder-recipe.jpg"
        />
      </div>
      <div className="flex-1 space-y-1">
        <p className="text-sm uppercase tracking-wide text-olive-400 dark:text-olive-300/80">Recipe</p>
        <h3 className="text-lg font-semibold text-olive-900 transition group-hover:text-olive-600 dark:text-gray-100 dark:group-hover:text-emerald-300">
          {recipe.title || 'Untitled recipe'}
        </h3>
        <p className="text-xs text-olive-600/80 line-clamp-2 dark:text-gray-400">
          {recipe.description || 'Visit the recipe to read the full description.'}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-olive-500 dark:text-gray-400">
          {recipe.category && <span className="rounded-full bg-olive-100 px-2 py-0.5 dark:bg-olive-500/10">{recipe.category}</span>}
          {recipe.cuisine && <span>{recipe.cuisine}</span>}
          {(prep ?? 0) + (cook ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {prep && cook ? `${prep + cook} min` : `${prep ?? cook} min`}
            </span>
          ) : null}
          {recipe.createdAt && <span>{formatDate(recipe.createdAt)}</span>}
        </div>
      </div>
    </Link>
  );
};


export default async function ExternalProfilePage({ params }) {
  const cookieStore = cookies();
  const cookieHeader = cookieStore?.toString?.() ?? '';
  const profile = await fetchProfile(params.id, undefined, cookieHeader);

  if (!profile) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-4 text-center">
        <div className="text-5xl">🍽️</div>
        <h1 className="text-3xl font-semibold text-olive-900 dark:text-gray-100">Profile unavailable</h1>
        <p className="max-w-md text-sm text-olive-600 dark:text-gray-400">
          We couldn’t find that culinary explorer. The profile might be private or has been removed.
        </p>
        <Link
          href="/community"
          className="inline-flex items-center gap-2 rounded-full bg-olive-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-olive-700"
        >
          Return to the community
        </Link>
      </div>
    );
  }

  const { user, recipes, posts } = profile;
  const displayName = user.displayName?.trim() || user.name || 'SavoryFlavors Member';
  const joinedLabel = formatDate(user.joinedAt);
  const firstName = displayName.split(' ')[0] || displayName;
  const recipeLabel = user.recipeCount === 1 ? 'recipe' : 'recipes';
  const postLabel = user.postCount === 1 ? 'conversation' : 'conversations';
  const spotlightRecipes = recipes.slice(0, 3);
  const featuredRecipes = recipes.slice(0, 6);
  const overviewPosts = posts.slice(0, 3);
  const hasOverviewPosts = overviewPosts.length > 0;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'recipes', label: 'Recipes', badge: user.recipeCount },
    { id: 'community', label: 'Community', badge: user.postCount }
  ];

  const tabSections = {
    overview: (
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2">
          <HighlightCard
            title="Chef highlight"
            description={`${firstName} has crafted ${user.recipeCount} public ${recipeLabel} for fellow food lovers.`}
            icon={Sparkles}
          />
          <HighlightCard
            title="Community impact"
            description={`${user.postCount} ${postLabel} sparked across the SavoryFlavors community.`}
            icon={Users}
            tone="amber"
          />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-olive-900 dark:text-gray-100">Featured recipes</h3>
            <Link
              href={`/recipes?user=${user.id}`}
              className="text-sm font-semibold text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              View all →
            </Link>
          </div>
          <RecipeGallery recipes={featuredRecipes} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-olive-900 dark:text-gray-100">Latest community posts</h3>
            <Link
              href={`/community?user=${user.id}`}
              className="text-sm font-semibold text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              Browse feed →
            </Link>
          </div>
          {hasOverviewPosts ? (
            <ExternalPostFeed initialPosts={overviewPosts} />
          ) : (
            <div className="rounded-3xl border border-dashed border-olive-200 bg-white/70 p-8 text-center text-sm text-olive-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
              No community posts to showcase yet.
            </div>
          )}
        </div>
      </div>
    ),
    recipes: <RecipeGallery recipes={recipes} />,
    community: <ExternalPostFeed initialPosts={posts} />
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16 pt-12 dark:bg-gray-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6">
        <section className="relative overflow-hidden rounded-[40px] bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 text-white shadow-2xl">
          <div className="absolute inset-0 opacity-[0.18]">
            <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <defs>
                <pattern id="external-profile-grid" width="120" height="120" patternUnits="userSpaceOnUse">
                  <path d="M 0 0 L 120 0 120 120" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
                <linearGradient id="external-profile-grid-fade" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#external-profile-grid)" />
              <rect width="100%" height="100%" fill="url(#external-profile-grid-fade)" />
            </svg>
          </div>

          <div className="relative flex flex-col gap-8 px-10 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-6">
              <div className="h-28 w-28 flex-shrink-0 overflow-hidden rounded-full border-4 border-white/40 bg-white/15 shadow-lg backdrop-blur-sm">
                {user.image ? (
                  <ImageWithFallback
                    src={user.image}
                    alt={displayName}
                    className="h-full w-full rounded-full object-cover"
                    fallback="/placeholder-avatar.jpg"
                  />
                ) : null}
                {!user.image ? (
                  <div className="flex h-full w-full items-center justify-center rounded-full text-3xl font-semibold">
                    {displayName
                      .split(' ')
                      .filter(Boolean)
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase() || 'SF'}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.35em]">
                  <span className="rounded-full bg-white/15 px-3 py-1">Community profile</span>
                  {user.role?.toLowerCase() === 'admin' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[11px]">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  )}
                  {user.adminTitle && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[11px]">
                      <TrendingUp className="h-3 w-3" /> {user.adminTitle}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold sm:text-5xl">{displayName}</h1>
                  <p className="text-sm text-white/80">{user.email}</p>
                  {user.location ? (
                    <p className="inline-flex items-center gap-2 text-sm text-white/80">
                      <MapPin className="h-4 w-4" />
                      {user.location}
                    </p>
                  ) : null}
                  {user.bio ? (
                    <p className="max-w-xl text-sm leading-relaxed text-white/80">{user.bio}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 pt-3">
                    <MessageUserButton
                      participantId={user.id}
                      participantName={displayName}
                    />
                    {!user.isViewingSelf ? (
                      <FollowUserButton
                        userId={user.id}
                        initialFollowerCount={user.followerCount}
                        initialIsFollowing={user.viewerFollows}
                      />
                    ) : null}
                    {!user.isViewingSelf ? (
                      <ReportUserButton
                        userId={user.id}
                        displayName={displayName}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid w-full max-w-xs gap-3 rounded-3xl bg-white/15 p-5 text-sm text-white shadow-inner backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span>Recipes</span>
                <strong className="text-xl">{user.recipeCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Community posts</span>
                <strong className="text-xl">{user.postCount}</strong>
              </div>
              {joinedLabel && (
                <div className="flex items-center justify-between text-white/80">
                  <span>Joined</span>
                  <span>{joinedLabel}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <main className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="space-y-6">
            <ProfileTabs tabs={tabs} sections={tabSections} />
          </section>
          <aside className="space-y-6">
            <AboutCard user={user} joinedLabel={joinedLabel} />
            <SocialPresenceCard recipes={spotlightRecipes} />
            <HighlightCard
              title="Invite friends"
              description="Share this profile and grow the SavoryFlavors community together."
              icon={Share2}
              tone="amber"
            />
          </aside>
        </main>
      </div>
    </div>
  );
}
