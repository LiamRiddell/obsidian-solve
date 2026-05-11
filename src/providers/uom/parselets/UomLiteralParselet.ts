import { InfixParselet } from "@/engine/parser/Parselet";
import { Parser } from "@/engine/parser/Parser";
import { Token } from "@/engine/lexer/Token";
import { BytecodeBuilder } from "@/engine/parser/BytecodeBuilder";
import { OpCode } from "@/engine/parser/OpCode";

const knownUnits = new Set([
  "mm", "cm", "m", "km", "in", "ft", "yd", "mi",
  "g", "kg", "lb", "oz",
  "ml", "l", "gal", "cup",
  "s", "min", "h", "day", "week", "month", "year",
  "C", "F", "K",
  "Hz", "kHz", "MHz", "GHz",
  "W", "kW", "MW", "GW",
  "V", "kV", "mV",
  "A", "kA", "mA",
  "Pa", "kPa", "MPa", "bar", "psi",
  "USD", "EUR", "GBP", "JPY",
]);

export class UomLiteralParselet implements InfixParselet {
  getBindingPower(): number {
    return 70;
  }

  parse(parser: Parser, left: Token, token: Token, builder: BytecodeBuilder): void {
    const unit = token.value;
    builder.emitOpcode(OpCode.PUSH_STRING);
    builder.emitString(unit);
    builder.emitOpcode(OpCode.UOM_CONVERT);
  }
}

export function isKnownUnit(text: string): boolean {
  return knownUnits.has(text.toLowerCase());
}