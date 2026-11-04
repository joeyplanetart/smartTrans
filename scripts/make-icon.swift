import AppKit

let output = CommandLine.arguments[1]
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
NSColor(calibratedRed: 0.14, green: 0.17, blue: 0.14, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 50, y: 50, width: 924, height: 924), xRadius: 210, yRadius: 210).fill()
let attributes: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 530, weight: .semibold),
  .foregroundColor: NSColor(calibratedRed: 0.94, green: 0.96, blue: 0.92, alpha: 1)
]
let text = "译" as NSString
let size = text.size(withAttributes: attributes)
text.draw(at: NSPoint(x: (1024 - size.width) / 2, y: (1024 - size.height) / 2 + 15), withAttributes: attributes)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
