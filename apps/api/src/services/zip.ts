import { crc32, deflateRaw } from "node:zlib"
import { promisify } from "node:util"

const deflate = promisify(deflateRaw)

export type ZipEntry = { name: string; data: Buffer }

/**
 * Minimal streaming ZIP writer (deflate, UTF-8 names). Each entry is compressed in memory, so memory use
 * is bounded by the largest single entry, not the whole archive. No ZIP64: entries/archive must stay < 4 GB.
 */
export async function* zipStream(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Buffer> {
  const central: Buffer[] = []
  let offset = 0
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  for await (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8")
    const body = await deflate(data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // flags: UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4) // version made by
    local.copy(cen, 6, 4, 26) // version needed .. uncompressed size (same fields, same order)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBuf)
    yield local
    yield nameBuf
    yield body
    offset += 30 + nameBuf.length + body.length
  }

  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length / 2, 8)
  end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  yield dir
  yield end
}
