import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

class BottomBar extends StatelessWidget {
  final VoidCallback? onExtensions;
  final VoidCallback? onNew;
  final VoidCallback? onSearch;
  final VoidCallback? onArchive;

  const BottomBar({
    super.key,
    this.onExtensions,
    this.onNew,
    this.onSearch,
    this.onArchive,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(left: 16, right: 16, bottom: 32),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _BottomActionButton(
              icon: const _ExtensionsIcon(),
              label: 'Extensions',
              onTap: onExtensions,
            ),
            _BottomActionButton(
              icon: const Icon(
                Icons.folder_open_outlined,
                size: 31,
                color: Colors.white,
              ),
              label: 'Archive',
              onTap: onArchive,
            ),
            _BottomActionButton(
              icon: const Icon(Icons.search, size: 31, color: Colors.white),
              label: 'Search',
              onTap: onSearch,
            ),
            _BottomActionButton(
              icon: const Icon(Icons.add, size: 31, color: Colors.white),
              label: '+ New',
              onTap: onNew,
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomActionButton extends StatelessWidget {
  final Widget icon;
  final String label;
  final VoidCallback? onTap;

  const _BottomActionButton({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassButton.custom(
      width: 70,
      height: 70,
      label: label,
      onTap: onTap ?? () {},
      useOwnLayer: true,
      quality: GlassQuality.standard,
      glowRadius: 1.1,
      child: Center(child: icon),
    );
  }
}

class _ExtensionsIcon extends StatelessWidget {
  const _ExtensionsIcon();

  @override
  Widget build(BuildContext context) {
    const pieceSize = 11.0;
    const gap = 4.0;
    return const SizedBox(
      width: pieceSize * 2 + gap,
      height: pieceSize * 2 + gap,
      child: Stack(
        children: [
          Positioned(left: 0, top: 0, child: _ExtensionsPiece(size: pieceSize)),
          Positioned(
            left: 0,
            top: pieceSize + gap,
            child: _ExtensionsPiece(size: pieceSize),
          ),
          Positioned(
            left: pieceSize + gap,
            top: pieceSize + gap,
            child: _ExtensionsPiece(size: pieceSize),
          ),
        ],
      ),
    );
  }
}

class _ExtensionsPiece extends StatelessWidget {
  final double size;

  const _ExtensionsPiece({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.white, width: 1.8),
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}
