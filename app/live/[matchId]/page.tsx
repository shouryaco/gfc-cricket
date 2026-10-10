import LiveBoard from "@/components/live-board";
export const dynamic="force-dynamic";
export default async function LivePage({params}:{params:Promise<{matchId:string}>}){const {matchId}=await params;return <LiveBoard matchId={matchId}/>}
