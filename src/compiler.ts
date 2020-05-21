import { createSourceFile, ScriptTarget, SyntaxKind, VariableStatement, Node, Identifier, StringLiteral, NumericLiteral } from 'typescript'
import { readFile as readFileAsync } from 'fs'
import { equal } from 'assert'
import { promisify } from 'util'
const readFile = promisify(readFileAsync)

enum ConstantKind {
  TAG_CLASS = 7,
  TAG_FIELD_REF = 9,
  TAG_METHOD_REF = 10,
  TAG_INTERFACE_METHOD_REF = 11,
  TAG_STRING = 8,
  TAG_INTEGER = 3,
  TAG_FLOAT = 4,
  TAG_LONG = 5,
  TAG_DOUBLE = 6,
  TAG_NAME_AND_TYPE = 12,
  TAG_UTF8 = 1,
  TAG_METHOD_HANDLE = 15,
  TAG_METHOD_TYPE = 16,
  TAG_INVOKE_DYNAMIC = 18,
}
enum AccessFlags {
  Public = 1,
  StaticPublic = 9,
}

type Constant = {
  kind: ConstantKind.TAG_UTF8
  str: string
} | {
  kind: ConstantKind.TAG_DOUBLE
  num: number
} | {
  kind: ConstantKind.TAG_CLASS
  name_index: number
} | {
  kind: ConstantKind.TAG_METHOD_REF
  class_index: number
  name_and_type_index: number
} | {
  kind: ConstantKind.TAG_NAME_AND_TYPE
  name_index: number
  description_index: number
} | {
  kind: ConstantKind.TAG_FIELD_REF
  class_index: number
  name_and_type_index: number
} | {
  kind: ConstantKind.TAG_STRING
  string_index: number
}
class ConstantPool {
  pool: Constant[] = []
  constructor () {}
  addString(str: string) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_UTF8 && i.str === str) + 1
    if (existed) {
      console.log('existed', str, existed)
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_UTF8,
      str
    })
    return this.pool.length
  }
  addStringObj(string_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_STRING && i.string_index === string_index) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_STRING,
      string_index
    })
    return this.pool.length
  }
  addNumber(num: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_DOUBLE && i.num === num) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_DOUBLE,
      num
    })
    return this.pool.length
  }
  addClass(name_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_CLASS && i.name_index === name_index) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_CLASS,
      name_index
    })
    return this.pool.length
  }
  addMethodRef(class_index: number, name_and_type_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_METHOD_REF
      && i.class_index === class_index
      && i.name_and_type_index === name_and_type_index
    ) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_METHOD_REF,
      class_index,
      name_and_type_index
    })
    return this.pool.length
  }
  addNameAndType(name_index: number, description_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_NAME_AND_TYPE
      && i.name_index === name_index
      && i.description_index === description_index
    ) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_NAME_AND_TYPE,
      name_index,
      description_index
    })
    return this.pool.length
  }
  addFieldRef(class_index: number, name_and_type_index: number) {
    const existed = this.pool.findIndex(i => i.kind === ConstantKind.TAG_FIELD_REF
      && i.class_index === class_index
      && i.name_and_type_index === name_and_type_index
    ) + 1
    if (existed) {
      return existed
    }
    this.pool.push({
      kind: ConstantKind.TAG_FIELD_REF,
      class_index,
      name_and_type_index
    })
    return this.pool.length
  }
  getMethodRef(cls: string, name: string, description: string) {
    return this.addMethodRef(
      this.addClass(this.addString(cls)),
      this.addNameAndType(
        this.addString(name),
        this.addString(description)
      )
    )
  }
  getFieldRef(cls: string, name: string, description: string) {
    return this.addFieldRef(
      this.addClass(this.addString(cls)),
      this.addNameAndType(this.addString(name), this.addString(description))
    )
  }
  write(buffer: Buffer, offset: number = 8) {
    offset = buffer.writeInt16BE(this.pool.length + 1, offset)
    for (const c of this.pool) {
      offset = buffer.writeInt8(c.kind, offset)
      switch (c.kind) {
        case ConstantKind.TAG_UTF8:
          offset = buffer.writeInt16BE(c.str.length, offset)
          offset += buffer.write(c.str, offset, 'utf8')
          break
        case ConstantKind.TAG_DOUBLE:
          offset = buffer.writeDoubleBE(c.num, offset)
          break
        case ConstantKind.TAG_CLASS:
          offset = buffer.writeInt16BE(c.name_index, offset)
          break
        case ConstantKind.TAG_METHOD_REF:
          offset = buffer.writeInt16BE(c.class_index, offset)
          offset = buffer.writeInt16BE(c.name_and_type_index, offset)
          break
        case ConstantKind.TAG_NAME_AND_TYPE:
          offset = buffer.writeInt16BE(c.name_index, offset)
          offset = buffer.writeInt16BE(c.description_index, offset)
          break
        case ConstantKind.TAG_FIELD_REF:
          offset = buffer.writeInt16BE(c.class_index, offset)
          offset = buffer.writeInt16BE(c.name_and_type_index, offset)
          break
        case ConstantKind.TAG_STRING:
          offset = buffer.writeInt16BE(c.string_index, offset)
          break
        default:
          // @ts-ignore
          throw new TypeError(`ConstantKind: ${c.kind} is not supported`)
      }
    }

    return offset
  }
}

class ClassInfo {
  pool = new ConstantPool()
  thisClass = 'Main'
  superClass = 'java/lang/Object'
  constructor() {}
  objectConstructor(methodRef: number) {
    const buf = Buffer.from([
      0x2a, // aload_0
      0xb7, // invokespecial method_ref
      0x00, // methodRef
      0x00,
      0xB1, // return
    ])
    buf.writeUInt16BE(methodRef, 2)
    return buf
  }
  makePrint() {
    const buf = Buffer.from([
      0xB2, // getstatic
      0, 0, // field ref
      0x2A, // aload_0
      0xB6, // invoke_virtual
      0, 0, // method ref
      0xB1, // return
    ])
    const p = this.pool
    buf.writeUInt16BE(p.getFieldRef(
      'java/lang/System', 'out', 'Ljava/io/PrintStream;'
    ), 1)
    buf.writeUInt16BE(p.getMethodRef(
      'java/io/PrintStream', 'println', '(Ljava/lang/String;)V'
    ), 5)
    return buf
  }
  makeCodeAttr(code: Buffer) {
    const buf = Buffer.alloc(1024)
    let offset = 0
    offset = buf.writeUInt16BE(0x10, offset) // max stack
    offset = buf.writeUInt16BE(0x10, offset) // max locals
    offset = buf.writeUInt32BE(code.byteLength, offset) // code length
    offset += code.copy(buf, offset) // code
    offset = buf.writeUInt16BE(0, offset) // exception table length
    offset = buf.writeUInt16BE(0, offset) // attr length
    return buf.slice(0, offset)
  }
  makeMethodInfo(access: AccessFlags, name: string, description: string, code: Buffer) {
    const buf = Buffer.alloc(1024)
    let offset = 0
    offset = buf.writeUInt16BE(access, offset) // access
    offset = buf.writeUInt16BE(this.pool.addString(name), offset) // name
    offset = buf.writeUInt16BE(this.pool.addString(description), offset) // description
    offset = buf.writeUInt16BE(1, offset) // attr count

    const codeAttr = this.makeCodeAttr(code)
    offset = buf.writeUInt16BE(this.pool.addString('Code'), offset) // Code attribute
    offset = buf.writeUInt32BE(codeAttr.byteLength, offset) // attr length
    offset += codeAttr.copy(buf, offset)
    return buf.slice(0, offset)
  }
  makeTemplate() {
    const p = this.pool
    const thisClass = p.addClass(p.addString(this.thisClass))
    const superClass = p.addClass(p.addString(this.superClass))
    const constructorNT = p.addNameAndType(p.addString('<init>'), p.addString('()V'))
    const superRef = this.pool.addMethodRef(superClass, constructorNT)
    const ctorMI = this.makeMethodInfo(AccessFlags.Public, '<init>', '()V', this.objectConstructor(superRef))
    const printMI = this.makeMethodInfo(AccessFlags.StaticPublic, 'print', '(Ljava/lang/String;)V', this.makePrint())

    return {
      thisClass,
      superClass,
      ctorMI,
      printMI,
    }
  }
  write(buffer: Buffer) {
    const {
      thisClass,
      superClass,
      ctorMI,
      printMI,
    } = this.makeTemplate()
    const mainCode = Buffer.from([
      0x12, // ldc
      0, // index
      0xB8, // invoke_static
      0, 0, // method ref
      0xB1, // return
    ])
    mainCode.writeInt8(this.pool.addStringObj(this.pool.addString('Hello world')), 1)
    mainCode.writeInt16BE(this.pool.getMethodRef(
      'Main', 'print', '(Ljava/lang/String;)V'
    ), 3)
    const main = this.makeMethodInfo(AccessFlags.StaticPublic, 'main', '([Ljava/lang/String;)V', mainCode)

    let offset = 0
    offset = buffer.writeUInt32BE(0xcafebabe, offset)
    offset = buffer.writeInt16BE(0, offset)
    offset = buffer.writeInt16BE(55, offset)
    offset = this.pool.write(buffer, offset)
    offset = buffer.writeInt16BE(0x21, offset) // access flags: SUPER,PUBLIC
    offset = buffer.writeInt16BE(thisClass, offset) // this class
    offset = buffer.writeInt16BE(superClass, offset) // super class
    offset = buffer.writeInt16BE(0, offset) // interface count
    offset = buffer.writeInt16BE(0, offset) // fields count
    offset = buffer.writeInt16BE(3, offset) // methods count
    // methods
    offset += ctorMI.copy(buffer, offset)
    offset += printMI.copy(buffer, offset)
    offset += main.copy(buffer, offset)
    // methods end
    offset = buffer.writeInt16BE(0, offset) // attr count

    return offset
  }
}

function getLiteral(node?: Node) {
  if (typeof node === 'undefined') throw new TypeError('Variable must be initialized')
  if (node.kind === SyntaxKind.StringLiteral) {
    return (node as StringLiteral).text
  } else if (node.kind === SyntaxKind.NumericLiteral) {
    return parseFloat((node as NumericLiteral).text)
  } else {
    throw new TypeError(`Initializer ${node.kind} is not supported`)
  }
}

export function compile(source: string) {
  const sourceFile = createSourceFile('main.ts', source, ScriptTarget.ES2020)
  const cls = new ClassInfo()
  const varConst = new Map()

  for (const i of sourceFile.statements) {
    if (i.kind === SyntaxKind.VariableStatement) {
      const s = i as VariableStatement
      equal(s.declarationList.kind, SyntaxKind.VariableDeclarationList)
      for (const decl of s.declarationList.declarations) {
        equal(decl.kind, SyntaxKind.VariableDeclaration)
        equal(decl.name.kind, SyntaxKind.Identifier)
        const name = (decl.name as Identifier).escapedText
        const value = getLiteral(decl.initializer)

        console.log('decl', name, value)

        let id: number
        if (typeof value === 'number') {
          id = cls.pool.addNumber(value)
        } else {
          id = cls.pool.addString(value)
        }
        varConst.set(name, id)
      }
    }
  }
  return cls
}
