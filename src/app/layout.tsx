import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "TaskBoard OS — Acme Inc", template: "%s · TaskBoard OS" },
  description: "Unified Operating System for Acme Inc — one login, one source of truth.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TaskBoard",
  },
  icons: {
    apple: "/icon-192.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0B0C" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        {/* Crash reporter: uncaught browser errors are sent to /api/client-error (server journal). */}
        <script dangerouslySetInnerHTML={{ __html: "(function(){var n=0;function s(k,e,x){if(n++>5)return;try{var b=JSON.stringify({kind:k,msg:String(e&&e.message||e),stack:String(e&&e.stack||x||'').slice(0,4000),url:location.pathname,ua:navigator.userAgent});if(navigator.sendBeacon)navigator.sendBeacon('/api/client-error',b);else fetch('/api/client-error',{method:'POST',body:b,keepalive:true})}catch(_){}}window.addEventListener('error',function(ev){s('error',ev.error||ev.message,ev.filename+':'+ev.lineno+':'+ev.colno)});window.addEventListener('unhandledrejection',function(ev){s('rejection',ev.reason)});var ce=console.error;console.error=function(){try{var a=arguments[0];if(a instanceof Error||/Minified React error|Uncaught|hydrat/i.test(String(a)))s('console',a instanceof Error?a:String(a))}catch(_){}return ce.apply(console,arguments)}})();" }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("taskboard-theme");var m=t==="light"?"light":"dark";document.documentElement.setAttribute("data-theme",m);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();` }} />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}