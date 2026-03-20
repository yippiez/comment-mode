import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

class BottomBar extends StatelessWidget {
  final VoidCallback? onNew;
  final VoidCallback? onSearch;
  final VoidCallback? onFiles;

  const BottomBar({super.key, this.onNew, this.onSearch, this.onFiles});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(left: 16, right: 16, bottom: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _BottomActionButton(
              icon: Icons.folder_open_outlined,
              label: 'Files',
              onTap: onFiles,
            ),
            const SizedBox(width: 30),
            _BottomActionButton(
              icon: Icons.search,
              label: 'Search',
              onTap: onSearch,
            ),
            const SizedBox(width: 30),
            _BottomActionButton(icon: Icons.add, label: '+ New', onTap: onNew),
          ],
        ),
      ),
    );
  }
}

class _BottomActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  const _BottomActionButton({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassButton(
      icon: icon,
      iconSize: 31,
      iconColor: Colors.white,
      width: 70,
      height: 70,
      label: label,
      onTap: onTap ?? () {},
      useOwnLayer: true,
      quality: GlassQuality.standard,
      glowRadius: 1.1,
    );
  }
}
