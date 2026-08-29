import { describe, expect, it } from "vitest";
import { parseCheckInPayload, tokenForMeeting } from "./check-in-token";

const meetingId = "b99a38d6-4508-4388-a1b0-9739533e263a";
const token = "abcdefghijklmnopqrstuvwxyz123456";

describe("check-in token parsing", () => {
  it("accepts a plain token", () => {
    expect(tokenForMeeting(token, meetingId)).toBe(token);
  });

  it("extracts the token and meeting from an HTTPS QR link", () => {
    const link = `https://192.168.0.103:3300/meetings/check-in?meeting=${meetingId}&token=${token}`;
    expect(parseCheckInPayload(link)).toEqual({ meetingId, token });
    expect(tokenForMeeting(link, meetingId)).toBe(token);
  });

  it("rejects a link created for another meeting", () => {
    const link = `https://192.168.0.103:3300/meetings/check-in?meeting=another-meeting&token=${token}`;
    expect(() => tokenForMeeting(link, meetingId)).toThrow("رمز الحضور يخص اجتماعاً آخر");
  });
});
