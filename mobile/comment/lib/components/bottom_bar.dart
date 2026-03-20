import 'package:flutter/material.dart';

class BottomBar extends StatelessWidget {
  final VoidCallback? onTap;

  const BottomBar({super.key, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 72,
      width: double.infinity,
      alignment: Alignment.bottomCenter,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 24, left: 40, right: 40),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: MediaQuery.of(context).size.width * 0.8,
            height: 56,
            decoration: BoxDecoration(
              color: Colors.grey[850],
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: onTap != null
                ? Center(
                    child: Icon(Icons.sort, color: Colors.grey[400], size: 24),
                  )
                : null,
          ),
        ),
      ),
    );
  }
}
