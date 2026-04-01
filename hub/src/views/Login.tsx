import {LogIn} from 'lucide-react';

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg">
            <div className="w-8 h-8 bg-white rounded-md rotate-45" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Welcome to OpenHub</h1>
          <p className="text-zinc-500">Firebase auth has been removed. Use server-based auth in next step.</p>
        </div>

        <button
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-black text-white rounded-xl font-bold opacity-70 cursor-not-allowed"
          disabled
        >
          <LogIn size={20} />
          Auth Disabled
        </button>
      </div>
    </div>
  );
}
