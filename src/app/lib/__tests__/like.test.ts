import { describe, it, expect } from "vitest";
import { containsPattern } from "../like";

describe("containsPattern", () => {
    it("wraps plain text so it matches anywhere", () => {
        expect(containsPattern("dune")).toBe("%dune%");
        expect(containsPattern("")).toBe("%%");
    });
    it.each([
        ["100%", "%100\\%%"],
        ["a_b", "%a\\_b%"],
        ["back\\slash", "%back\\\\slash%"],
        ["%_\\", "%\\%\\_\\\\%"],
        ["%%", "%\\%\\%%"],
    ])("escapes the LIKE characters in %j", (input, expected) => {
        expect(containsPattern(input)).toBe(expected);
    });
    it("leaves every other character alone", () => {
        const text = `O'Brien "x" & <b> ü 三体 .* [a-z] $1 ^ ( ) + ? { }`;
        expect(containsPattern(text)).toBe(`%${text}%`);
    });
    it("escaping is reversible: removing the backslashes before % _ \\ gives back the input", () => {
        const input = "50%_off\\now%";
        const body = containsPattern(input).slice(1, -1);
        expect(body.replace(/\\([\\%_])/g, "$1")).toBe(input);
    });
});
