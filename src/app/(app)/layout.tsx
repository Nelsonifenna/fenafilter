import { AppNav } from "@/components/layout/AppNav";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppNav />
      <main className="frame flex-1 pt-8 pb-20 sm:pt-12">{children}</main>
      <SiteFooter />
    </>
  );
}
