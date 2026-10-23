import AppKit
import Foundation

/// Generate the app icon from the same V vector and violet gradient as the site.
/// Run on macOS before xcodegen: swift native/ios/scripts/generate-icon.swift
let size = 1024
let project = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    .deletingLastPathComponent()
let target = project.appendingPathComponent("Sources/App/Assets.xcassets/AppIcon.appiconset")
try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size,
    pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0),
    let context = NSGraphicsContext(bitmapImageRep: bitmap)
else { throw NSError(domain: "VainahIcon", code: 1) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
let full = NSRect(x: 0, y: 0, width: size, height: size)
let light = NSColor(calibratedRed: 189/255, green: 159/255, blue: 255/255, alpha: 1)
let dark = NSColor(calibratedRed: 101/255, green: 60/255, blue: 224/255, alpha: 1)
NSGradient(starting: light, ending: dark)?.draw(in: full, angle: 135)
func stroke(_ color: NSColor, _ width: CGFloat, _ points: [NSPoint]) {
    let path = NSBezierPath()
    path.lineWidth = width
    path.lineCapStyle = .round
    path.lineJoinStyle = .round
    if let first = points.first {
        path.move(to: first)
        for point in points.dropFirst() { path.line(to: point) }
    }
    color.setStroke()
    path.stroke()
}
stroke(.white, 108, [
    NSPoint(x: 215, y: 714),
    NSPoint(x: 512, y: 239),
    NSPoint(x: 809, y: 714)
])
stroke(NSColor(calibratedRed: 209/255, green: 247/255, blue: 255/255, alpha: 1),
    60, [
        NSPoint(x: 512, y: 846),
        NSPoint(x: 665, y: 567),
        NSPoint(x: 512, y: 239)
    ])
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "VainahIcon", code: 2)
}
try png.write(to: target.appendingPathComponent("AppIcon.png"), options: .atomic)
print("Generated first-party Vainah VPN app icon")
