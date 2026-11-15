import { describe, expect, it } from "vitest";
import { canHandover, canTransition } from "@/features/orders/state-machine";
describe("order state machine",()=>{it("allows the controlled happy path",()=>{expect(canTransition("picked_up","in_transit")).toBe(true)});it("blocks arbitrary jumps",()=>{expect(canTransition("confirmed","delivered")).toBe(false)});it("blocks handover until verified payment",()=>{expect(canHandover("arrived_at_destination","pending")).toBe(false);expect(canHandover("arrived_at_destination","paid")).toBe(true)})});
