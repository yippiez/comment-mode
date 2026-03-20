import 'package:flutter/material.dart';

class Card extends StatelessWidget {
  final String title;
  final double maxWidthPercentage;
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;

  const Card({
    super.key,
    required this.title,
    required this.maxWidthPercentage,
    required this.child,
    this.onTap,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final maxWidth = maxWidthPercentage * screenWidth;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: maxWidth,
        constraints: BoxConstraints(
          maxWidth: maxWidth,
          maxHeight: 0.4 * MediaQuery.of(context).size.height,
        ),
        decoration: BoxDecoration(
          color: Colors.grey[850],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[800]!, width: 0.5),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
              child: Row(children: [Text(title)]),
            ),
          ],
        ),
      ),
    );
  }
}
