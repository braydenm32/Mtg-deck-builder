import { describe, expect, it } from "vitest";
import { changeCommanderDamage, changeLife, changePoison, gameNote, newGame, nextTurn, outReason, suggestedResult } from "@/lib/deck/life";

describe("life counter", () => {
  it("starts everyone on 40 and names you first", () => {
    const g = newGame(4, ["", "Sam"]);
    expect(g.players.map((p) => p.name)).toEqual(["You", "Sam", "Player 3", "Player 4"]);
    expect(g.players.every((p) => p.life === 40 && p.commander.length === 4)).toBe(true);
    expect(newGame(9).players).toHaveLength(6);
  });

  it("takes commander damage off life too, and 21 from one commander is out", () => {
    let g = newGame(3);
    g = changeCommanderDamage(g, 0, 1, 20);
    expect(g.players[0]).toMatchObject({ life: 20, commander: [0, 20, 0] });
    expect(outReason(g.players[0])).toBeNull();
    g = changeCommanderDamage(g, 0, 1, 1);
    expect(outReason(g.players[0])).toBe("21 commander damage");
    g = changeCommanderDamage(g, 0, 1, -30);
    expect(g.players[0]).toMatchObject({ life: 40, commander: [0, 0, 0] });
  });

  it("knows when you've won or lost, and writes the note", () => {
    let g = newGame(3);
    g = changeLife(g, 1, -40);
    expect(suggestedResult(g)).toBeUndefined();
    g = changePoison(g, 2, 10);
    expect(suggestedResult(g)).toBe("win");
    g = nextTurn(nextTurn(g));
    expect(g.turn).toBe(3);
    g = changeCommanderDamage(changeLife(g, 0, -5), 0, 2, 6);
    expect(gameNote(g)).toBe("Ended on 29 life, 6 commander damage from Player 3. (Life counter)");
    g = changeLife(g, 0, -29);
    expect(suggestedResult(g)).toBe("loss");
    expect(gameNote(g)).toContain("Out to no life left.");
  });
});
