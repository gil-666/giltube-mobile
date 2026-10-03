import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

public final class GenerateStoreAssets {
  private static final RenderingHints QUALITY = new RenderingHints(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

  public static void main(String[] args) throws Exception {
    File root = new File(args.length == 0 ? "." : args[0]);
    File out = new File(root, "play-store/generated");
    out.mkdirs();
    BufferedImage padded = ImageIO.read(new File(root, "assets/images/giltube-icon-padded.png"));
    BufferedImage icon = new BufferedImage(512, 512, BufferedImage.TYPE_INT_ARGB);
    Graphics2D ig = icon.createGraphics();
    ig.setRenderingHints(QUALITY);
    ig.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    // An intermediate crop keeps the G comfortably inside Play's masks without
    // returning to the overly zoomed original artwork.
    ig.drawImage(padded, 0, 0, 512, 512, 128, 128, 896, 896, null);
    ig.dispose();
    ImageIO.write(icon, "png", new File(out, "giltube-play-store-icon-512.png"));

    BufferedImage feature = new BufferedImage(1024, 500, BufferedImage.TYPE_INT_RGB);
    Graphics2D g = feature.createGraphics();
    g.setRenderingHints(QUALITY);
    g.setPaint(new GradientPaint(0, 0, new Color(4, 4, 6), 1024, 500, new Color(26, 2, 6)));
    g.fillRect(0, 0, 1024, 500);
    g.setPaint(new RadialGradientPaint(new Point2D.Float(810, 250), 360, new float[]{0, .42f, 1}, new Color[]{new Color(255, 0, 20, 160), new Color(120, 0, 10, 80), new Color(0, 0, 0, 0)}));
    g.fillRect(440, 0, 584, 500);
    g.setStroke(new BasicStroke(2f));
    for (int x = -300; x < 1300; x += 76) {
      g.setColor(new Color(255, 255, 255, x % 152 == 0 ? 12 : 6));
      g.drawLine(x, 500, x + 360, 0);
    }
    g.setColor(new Color(239, 0, 22, 42));
    g.fill(new RoundRectangle2D.Float(34, 55, 570, 390, 42, 42));
    g.setColor(new Color(255, 255, 255, 17));
    g.draw(new RoundRectangle2D.Float(34, 55, 570, 390, 42, 42));

    BufferedImage wordmark = ImageIO.read(new File(root, "assets/images/giltube-wordmark.png"));
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    g.drawImage(wordmark, 72, 105, 438, 237, null);
    g.setColor(new Color(239, 0, 22));
    g.fill(new RoundRectangle2D.Float(74, 310, 178, 7, 7, 7));
    g.setColor(new Color(255, 255, 255, 36));
    g.fill(new RoundRectangle2D.Float(74, 342, 385, 10, 10, 10));
    g.fill(new RoundRectangle2D.Float(74, 370, 305, 10, 10, 10));
    g.setColor(new Color(239, 0, 22, 175));
    for (int x = 74; x < 250; x += 44) g.fill(new Ellipse2D.Float(x, 405, 8, 8));

    g.setComposite(AlphaComposite.SrcOver);
    g.drawImage(icon, 655, 70, 360, 360, null);
    g.setPaint(new GradientPaint(600, 0, new Color(0, 0, 0, 0), 1024, 0, new Color(0, 0, 0, 75)));
    g.fillRect(600, 0, 424, 500);
    g.dispose();
    ImageIO.write(feature, "png", new File(out, "giltube-feature-graphic-1024x500.png"));
  }
}
