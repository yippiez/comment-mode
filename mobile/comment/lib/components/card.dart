import 'package:flutter/material.dart';

class Card extends StatelessWidget {
  final String title;
  final double? maxWidthPercentage;
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool isSelected;

  const Card({
    super.key,
    required this.title,
    this.maxWidthPercentage,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.isSelected = false,
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

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        width: maxWidth,
        constraints: constraints,
        decoration: BoxDecoration(
          color: Colors.grey[850],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: borderColor, width: 1),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
              child: Text(title),
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
                    child: child,
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
