
import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { LogOut, User as UserIcon } from 'lucide-react';

export default function UserProfile() {
  const { user, signOut } = useAuthStore();

  if (!user) return null;

  return (
    <div className="flex items-center gap-3 px-2 py-3 mt-auto border-t border-gray-200 dark:border-gray-700">
      <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300">
        <UserIcon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {user.email}
        </p>
      </div>
      <button
        onClick={() => signOut()}
        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
        title="退出登录"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}
