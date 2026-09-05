import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  MoreHorizontal,
  Fuel,
  Receipt,
  Users,
  Briefcase,
  UserCog,
  Wallet,
  FileText,
  CreditCard,
  Landmark,
  BookOpen,
  Wrench,
  BarChart3,
  CheckSquare,
  Bell,
  ShieldCheck,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { NavIconKey } from "@/lib/navigation";

/**
 * The only place `NavIconKey` strings are resolved to an actual Lucide
 * component. Navigation data crosses the Server → Client boundary as plain
 * `iconKey` strings (see src/lib/navigation.ts); each component that
 * renders an icon imports this map directly and looks the component up
 * locally, so no function reference is ever passed as a prop from a
 * Server Component.
 */
export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  "clipboard-list": ClipboardList,
  truck: Truck,
  fuel: Fuel,
  receipt: Receipt,
  users: Users,
  briefcase: Briefcase,
  "user-cog": UserCog,
  wallet: Wallet,
  "file-text": FileText,
  "credit-card": CreditCard,
  landmark: Landmark,
  "book-open": BookOpen,
  wrench: Wrench,
  "bar-chart": BarChart3,
  "check-square": CheckSquare,
  bell: Bell,
  "shield-check": ShieldCheck,
  history: History,
  settings: Settings,
  more: MoreHorizontal,
};
