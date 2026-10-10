import { requireAdmin } from "./admin-auth";
import ClubApp from "@/components/club-app";
export const dynamic="force-dynamic";
export default async function Home() { const user=await requireAdmin(); return <ClubApp userName={user.displayName}/>; }
