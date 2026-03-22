import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

Future<void> showGlassConfirmationDialog(
  BuildContext context, {
  required String title,
  String? description,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  Color confirmTextColor = Colors.white,
  Color? confirmGlowColor,
  required VoidCallback onConfirm,
}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 300),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            GlassCard(
              useOwnLayer: true,
              quality: GlassQuality.standard,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  if (description != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      description,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Colors.white70,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: GlassButton.custom(
                    onTap: () => Navigator.of(ctx).pop(),
                    height: 54,
                    useOwnLayer: true,
                    shape: const LiquidRoundedSuperellipse(borderRadius: 20),
                    child: Text(
                      cancelLabel,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: GlassButton.custom(
                    onTap: () {
                      Navigator.of(ctx).pop();
                      onConfirm();
                    },
                    height: 54,
                    useOwnLayer: true,
                    shape: const LiquidRoundedSuperellipse(borderRadius: 20),
                    glowColor: confirmGlowColor,
                    child: Text(
                      confirmLabel,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: confirmTextColor,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
