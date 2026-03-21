import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

const _bottomBarButtonSize = 70.0;
const _bottomBarTransitionDuration = Duration(milliseconds: 220);

class BottomBar extends StatelessWidget {
  final VoidCallback? onExtensions;
  final VoidCallback? onNew;
  final VoidCallback? onSearchOpen;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback? onSearchClose;
  final VoidCallback? onSearchSubmit;
  final VoidCallback? onArchive;
  final bool isSearchOpen;
  final String searchQuery;

  const BottomBar({
    super.key,
    this.onExtensions,
    this.onNew,
    this.onSearchOpen,
    this.onSearchChanged,
    this.onSearchClose,
    this.onSearchSubmit,
    this.onArchive,
    required this.isSearchOpen,
    required this.searchQuery,
  });

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.of(context).viewInsets.bottom;

    return SafeArea(
      top: false,
      child: AnimatedPadding(
        duration: _bottomBarTransitionDuration,
        curve: Curves.easeOutCubic,
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          bottom: 32 + (isSearchOpen ? keyboardInset : 0),
        ),
        child: SizedBox(
          height: _bottomBarButtonSize,
          child: AnimatedSwitcher(
            duration: _bottomBarTransitionDuration,
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            layoutBuilder: (currentChild, previousChildren) {
              return Stack(
                alignment: Alignment.center,
                children: [...previousChildren, ?currentChild],
              );
            },
            transitionBuilder: (child, animation) {
              return FadeTransition(
                opacity: animation,
                child: ScaleTransition(
                  scale: Tween<double>(
                    begin: 0.98,
                    end: 1.0,
                  ).animate(animation),
                  child: child,
                ),
              );
            },
            child: isSearchOpen
                ? _ExpandedSearchBar(
                    key: const ValueKey('bottom-bar-open-search'),
                    searchQuery: searchQuery,
                    onChanged: onSearchChanged,
                    onClose: onSearchClose,
                    onSubmit: onSearchSubmit,
                  )
                : _ClosedActionsRow(
                    key: const ValueKey('bottom-bar-closed-actions'),
                    onExtensions: onExtensions,
                    onArchive: onArchive,
                    onSearch: onSearchOpen,
                    onNew: onNew,
                  ),
          ),
        ),
      ),
    );
  }
}

class _ClosedActionsRow extends StatelessWidget {
  final VoidCallback? onExtensions;
  final VoidCallback? onArchive;
  final VoidCallback? onSearch;
  final VoidCallback? onNew;

  const _ClosedActionsRow({
    super.key,
    this.onExtensions,
    this.onArchive,
    this.onSearch,
    this.onNew,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
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
    );
  }
}

class _ExpandedSearchBar extends StatefulWidget {
  final String searchQuery;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onClose;
  final VoidCallback? onSubmit;

  const _ExpandedSearchBar({
    super.key,
    required this.searchQuery,
    this.onChanged,
    this.onClose,
    this.onSubmit,
  });

  @override
  State<_ExpandedSearchBar> createState() => _ExpandedSearchBarState();
}

class _ExpandedSearchBarState extends State<_ExpandedSearchBar> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.searchQuery);
    _focusNode = FocusNode();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _focusNode.requestFocus();
      }
    });
  }

  @override
  void didUpdateWidget(covariant _ExpandedSearchBar oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (widget.searchQuery != _controller.text) {
      _controller.value = TextEditingValue(
        text: widget.searchQuery,
        selection: TextSelection.collapsed(offset: widget.searchQuery.length),
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: _bottomBarButtonSize,
      child: GlassContainer(
        useOwnLayer: true,
        quality: GlassQuality.standard,
        width: double.infinity,
        height: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            const Icon(Icons.search, size: 28, color: Colors.white70),
            const SizedBox(width: 8),
            Expanded(
              child: Theme(
                data: Theme.of(context).copyWith(
                  textSelectionTheme: const TextSelectionThemeData(
                    cursorColor: Colors.white,
                    selectionColor: Colors.white30,
                    selectionHandleColor: Colors.white,
                  ),
                  colorScheme: Theme.of(
                    context,
                  ).colorScheme.copyWith(primary: Colors.white),
                ),
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  onChanged: widget.onChanged,
                  onSubmitted: (_) => widget.onSubmit?.call(),
                  textInputAction: TextInputAction.search,
                  cursorColor: Colors.white,
                  decoration: const InputDecoration(
                    isDense: true,
                    filled: false,
                    fillColor: Colors.transparent,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    hintText: 'Search',
                    hintStyle: TextStyle(color: Colors.white54, fontSize: 18),
                  ),
                  style: const TextStyle(color: Colors.white, fontSize: 18),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 38,
              height: 38,
              child: IconButton(
                style: IconButton.styleFrom(
                  foregroundColor: Colors.white70,
                  overlayColor: Colors.white24,
                  padding: EdgeInsets.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                iconSize: 20,
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.close_rounded),
                onPressed: widget.onClose,
              ),
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
      width: _bottomBarButtonSize,
      height: _bottomBarButtonSize,
      shape: const LiquidRoundedSuperellipse(borderRadius: 36),
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
