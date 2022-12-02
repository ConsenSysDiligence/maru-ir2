Program
    = (d: Definition __ { return d; })*;

Definition
    = StructDefinition
    / FunctionDefinition;

TypeFormalParams
    = LT __ tVars: IdList __ GT { return tVars; }

MemoryFormalParams
    = LBRACKET __ mVars: IdList __ RBRACKET { return mVars; }

StructField
    = name: Identifier __ COLON __ type: Type __ SEMICOLON { return [name, type]; }

StructDefinition
    = STRUCT __ mArgs: MemoryFormalParams? __ tArgs: TypeFormalParams? __ name: Identifier __ LCBRACE __ fields: (f: StructField __ { return f; })* __ RCBRACE {
        return new StructDefinition<SrcRange>(
            getFreshId(options as ParseOptions),
            location(),
            mArgs === null ? [] : mArgs,
            tArgs === null ? [] : tArgs,
            name,
            fields === null ? [] : fields);
    }

FunctionParameters
    = head: (name: Identifier __ COLON __ typ: Type { return [name, typ]; })
      tail: (__ COMMA __ name: Identifier __ COLON __ typ: Type {return [name, typ]; })* {
        return [head, ...tail];
      }

FunBody
    = LCBRACE __ RCBRACE

FunctionDefinition
    = FUNCTION __ mArgs: MemoryFormalParams? __ tArgs: TypeFormalParams? __ name: Identifier __  LPAREN __ params: FunctionParameters? __ RPAREN rets: (__ COLON __ retT: Type { return retT; })? __ body: FunBody? {
        return new FunctionDefinition(
            getFreshId(options as ParseOptions),
            location(),
            mArgs === null ? [] : mArgs,
            tArgs === null ? [] : tArgs,
            name,
            params === null ? [] : params,
            rets === null ? [] : [rets]);
    }

IdList
    = head: Identifier tail: (__ COMMA __ id: Identifier {return id;})* {
        return [head, ...tail];
    }

TypeArgs
    = head: Type tail: (__ COMMA __ typ: Type { return typ; })* { return [head, ...tail]; }

UserDefinedType
    = name: Identifier memArgs: (LBRACKET __  ids: IdList __ RBRACKET { return ids; })? typeArgs: (LT __ types:TypeArgs __ GT { return types; })? {
        return new UserDefinedType(getFreshId(options as ParseOptions), location(), name, memArgs === null ? [] : memArgs, typeArgs === null ? [] : typeArgs);
    }

PrimitiveType
    = IntType
    / BOOL { return new BoolType(getFreshId(options as ParseOptions), location()); }
    / UserDefinedType
    / LPAREN innerT: Type RPAREN { return innerT; }

IntType
    = unsigned:("u"?) "int" nbits:([0-9]+ {return Number(text())})  { return new IntType(getFreshId(options as ParseOptions), location(), nbits, unsigned == null); }

PointerOrArrayType
    = head: PrimitiveType tail: ((__ STAR __ Identifier) / __ LBRACKET __ RBRACKET)* {
        return tail.reduce(
            (acc: Type, el: any) => {
                if (el[1] === "*") {
                    return new PointerType(getFreshId(options as ParseOptions), location(), acc, el[3]);
                } else {
                    return new ArrayType(getFreshId(options as ParseOptions), location(), acc);
                }
            },
            head
        )
    }

Type = PointerOrArrayType

// Keywords
STRUCT = "struct"
FUNCTION = "fun"
LCBRACE = "{"
RCBRACE = "}"
LPAREN = "("
RPAREN = ")"
LBRACKET = "["
RBRACKET = "]"
COLON = ":"
BOOL = "bool"
SEMICOLON = ";"
LT = "<"
GT = ">"
COMMA = ","
STAR = "*"

Keyword
    = STRUCT
    / FUNCTION

Identifier =
    !(Keyword ![a-zA-Z0-9_]) id:([a-zA-Z_][a-zA-Z0-9_]*) { return text(); }
// Whitespace

PrimitiveWhiteSpace =
    "\t"
    / "\v"
    / "\f"
    / " "
    / "\u00A0"
    / "\uFEFF"
    / Zs

WhiteSpace "whitespace" =
    PrimitiveWhiteSpace
    / LineTerminator PrimitiveWhiteSpace* ("*" / "///")

// Separator, Space

Zs =
    [\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]

LineTerminator =
    [\n\r\u2028\u2029]

LineTerminatorSequence =
    "\n"
    / "\r\n"
    / "\r"
    / "\u2028"
    / "\u2029"

__ =
    (WhiteSpace / LineTerminator)*