import 'package:flutter/material.dart';
import 'package:comment/models/card.dart';
import 'package:comment/shared/card_color_palette.dart';

class Card extends StatelessWidget {
  final String title;
  final double? maxWidthPercentage;
  final Widget child;
  final VoidCallback? onTap;
  final bool isSelected;
  final CardColors color;
  final CardStatus status;

  const Card({
    super.key,
    required this.title,
    this.maxWidthPercentage,
    required this.child,
    this.onTap,
    this.isSelected = false,
    this.color = CardColors.gray,
    this.status = CardStatus.normal,
  });

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.of(context).size;
    final screenWidth = screenSize.width;
    final maxWidth = maxWidthPercentage == null
        ? null
        : maxWidthPercentage! * screenWidth;
    final maxCardHeight = 0.8 * screenSize.height;
    final maxContentHeight = (maxCardHeight - 52)
        .clamp(0.0, double.infinity)
        .toDouble();
    final constraints = maxWidth == null
        ? BoxConstraints(maxHeight: maxCardHeight)
        : BoxConstraints(maxWidth: maxWidth, maxHeight: maxCardHeight);
    final borderColor = isSelected ? Colors.white : Colors.grey[800]!;
    final statusEmoji = switch (status) {
      CardStatus.hasUpdate => '🥶',
      CardStatus.stale => '🫠',
      CardStatus.normal => null,
    };
    final cardColor = color.backgroundColor;
    final foregroundColor = color.foregroundColor;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: maxWidth,
        constraints: constraints,
        decoration: BoxDecoration(
          color: cardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: borderColor, width: 1),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(title, style: TextStyle(color: foregroundColor)),
                  if (statusEmoji != null)
                    Text(statusEmoji, style: const TextStyle(fontSize: 16)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxContentHeight),
                child: ClipRect(
                  child: ShaderMask(
                    shaderCallback: (bounds) {
                      return const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black,
                          Colors.black,
                          Colors.transparent,
                        ],
                        stops: [0.0, 0.85, 1.0],
                      ).createShader(bounds);
                    },
                    blendMode: BlendMode.dstIn,
                    child: DefaultTextStyle.merge(
                      style: TextStyle(
                        color: foregroundColor.withValues(alpha: 0.9),
                      ),
                      child: IconTheme.merge(
                        data: IconThemeData(color: foregroundColor),
                        child: child,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
