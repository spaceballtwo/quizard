import Cocoa

// Renders the Quizard app icon (gold wizard hat on a navy gradient) at all
// sizes macOS needs, into Quizard.iconset/.

let sizes: [(String, Int)] = [
  ("icon_16x16",16),("icon_16x16@2x",32),
  ("icon_32x32",32),("icon_32x32@2x",64),
  ("icon_128x128",128),("icon_128x128@2x",256),
  ("icon_256x256",256),("icon_256x256@2x",512),
  ("icon_512x512",512),("icon_512x512@2x",1024)
]

// star centered at (cxAbs, cyTopFrac) with absolute radius r
func starPath(_ cx: CGFloat, _ cyTopFrac: CGFloat, _ r: CGFloat, _ s: CGFloat) -> CGPath {
  let p = CGMutablePath()
  let cy = s - cyTopFrac * s
  for i in 0..<8 {
    let ang = CGFloat(i) * (.pi/4) - .pi/2
    let rad = (i % 2 == 0) ? r : r*0.4
    let pt = CGPoint(x: cx + cos(ang)*rad, y: cy + sin(ang)*rad)
    if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
  }
  p.closeSubpath()
  return p
}

func render(_ px: Int) -> Data? {
  let cs = CGColorSpaceCreateDeviceRGB()
  guard let ctx = CGContext(data:nil, width:px, height:px, bitsPerComponent:8,
                            bytesPerRow:0, space:cs,
                            bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
  let s = CGFloat(px)
  // rounded navy background with gradient
  let bg = CGPath(roundedRect: CGRect(x:0,y:0,width:s,height:s),
                  cornerWidth: s*0.22, cornerHeight: s*0.22, transform:nil)
  ctx.saveGState(); ctx.addPath(bg); ctx.clip()
  let grad = CGGradient(colorsSpace: cs,
    colors: [CGColor(red:0.16,green:0.36,blue:0.55,alpha:1),
             CGColor(red:0.09,green:0.20,blue:0.33,alpha:1)] as CFArray, locations:[0,1])!
  ctx.drawLinearGradient(grad, start: CGPoint(x:0,y:s), end: CGPoint(x:s,y:0), options: [])
  ctx.restoreGState()

  let gold = CGColor(red:0.96, green:0.72, blue:0.24, alpha:1)
  func P(_ xf: CGFloat, _ yfTop: CGFloat) -> CGPoint { CGPoint(x: xf*s, y: s - yfTop*s) }

  // brim
  ctx.setFillColor(gold)
  ctx.addPath(CGPath(ellipseIn: CGRect(x:0.20*s, y: s-0.71*s, width:0.60*s, height:0.13*s), transform:nil))
  ctx.fillPath()
  // cone
  ctx.beginPath()
  ctx.move(to: P(0.5,0.13)); ctx.addLine(to: P(0.76,0.64)); ctx.addLine(to: P(0.24,0.64)); ctx.closePath()
  ctx.setFillColor(gold); ctx.fillPath()
  // stars
  ctx.setFillColor(CGColor(red:1,green:1,blue:1,alpha:0.95))
  for st in [(0.46,0.32,0.055),(0.57,0.48,0.038),(0.40,0.52,0.032)] {
    ctx.addPath(starPath(CGFloat(st.0)*s, CGFloat(st.1), CGFloat(st.2)*s, s)); ctx.fillPath()
  }
  ctx.addPath(starPath(0.5*s, 0.09, 0.05*s, s)); ctx.fillPath()

  guard let img = ctx.makeImage() else { return nil }
  return NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])
}

let dir = "Quizard.iconset"
try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
for (name, px) in sizes {
  if let d = render(px) { try? d.write(to: URL(fileURLWithPath: "\(dir)/\(name).png")) }
}
print("iconset written")
