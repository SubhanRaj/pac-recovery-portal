"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLastRole } from "@/lib/client-session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Just a first-paint guess (see lib/session.ts) — the destination page re-verifies via
    // GET /api/auth/me and bounces to /login itself if the cookie's missing/expired.
    const role = getLastRole();
    if (!role) {
      router.replace("/login");
    } else if (role === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/deo-data-entry");
    }
  }, [router]);

  return null;
}
