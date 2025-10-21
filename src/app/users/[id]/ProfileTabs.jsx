'use client';

import { useState } from 'react';

export default function ProfileTabs({ tabs = [], sections = {} }) {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return null;
  }

  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <div className="overflow-hidden rounded-3xl border border-olive-100 bg-white/80 shadow-sm ring-1 ring-olive-100/80 dark:border-gray-800 dark:bg-gray-900/70 dark:ring-gray-800">
      <div className="flex flex-wrap gap-2 border-b border-olive-100 bg-white/90 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950 ${
                isActive
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-olive-50 text-olive-700 hover:bg-olive-100 dark:bg-gray-800/80 dark:text-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && (
                <span
                  className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-xs font-semibold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white/70 text-emerald-600 dark:bg-gray-900 dark:text-emerald-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="space-y-8 p-6">
        {tabs.map((tab) => (
          <div key={tab.id} className={tab.id === activeTab ? 'block' : 'hidden'}>
            {sections[tab.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
