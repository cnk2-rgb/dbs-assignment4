import { UserButton } from "@clerk/nextjs";
import { GridMood } from "./grid-mood";

export default function HomePage() {
  return (
    <>
      <div className="fixed right-6 top-6 z-50">
        <div className="rounded-full border border-white/60 bg-white/90 p-1 shadow-[0_10px_30px_rgba(16,20,24,0.12)] backdrop-blur">
          <UserButton />
        </div>
      </div>
      <GridMood />
    </>
  );
}
