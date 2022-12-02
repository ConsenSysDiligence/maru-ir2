// @ts-nocheck

import { parse } from "path";
import {
    Definition,
    StructDefinition,
    IntType,
    BoolType,
    UserDefinedType,
    PointerType,
    ArrayType,
    FunctionDefinition
} from "../ir";

export type PegsLoc = { offset: number; line: number; column: number };
export type PegsRange = { start: PegsLoc; end: PegsLoc };

type ParseOptions = {
    startRule: string;
    idCtr: number;
};

export function parseProgram(str: string): Array<Definition<PegsRange>> {
    return parse(str, { startRule: "Program", idCtr: 0 } as ParseOptions);
}

function getFreshId(opts: ParseOptions): number {
    return opts.idCtr++;
}
