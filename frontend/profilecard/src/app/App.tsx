import { useState, useEffect } from "react";
import ImportedCard from "@/imports/資料小卡/index";

const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 877;

export default function App() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function update() {
      setScale(window.innerWidth / DESIGN_WIDTH);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div
      style={{ width: "100vw", height: DESIGN_HEIGHT * scale, position: "fixed", bottom: 0, left: 0 }}
      className="overflow-hidden"
    >
      <div
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      >
        <ImportedCard />
      </div>
    </div>
  );
}
