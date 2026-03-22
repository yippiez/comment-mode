import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

final class NewCardPopupLayout {
  static const width = 250.0;
  static const gap = 12.0;

  static const borderRadius = 24.0;
  static const sidePadding = 12.0;
  static const topPadding = 12.0;
  static const bottomPadding = 8.0;
  static const buttonHeight = 54.0;
  static const buttonBorderRadius = 18.0;
  static const buttonDividerSpacing = 6.0;
  static const dividerListSpacing = 4.0;
  static const dividerThickness = 1.0;

  static const visibleSessionCount = 3;
  static const mockSessionCount = 5;

  static const height =
      topPadding +
      buttonHeight +
      buttonDividerSpacing +
      dividerThickness +
      dividerListSpacing +
      (buttonHeight * visibleSessionCount) +
      bottomPadding;

  const NewCardPopupLayout._();
}

class FractionalOriginAlignment extends Alignment {
  const FractionalOriginAlignment(double fractionX, double fractionY)
    : super(fractionX * 2 - 1, fractionY * 2 - 1);
}

class NewCardPopupContent extends StatelessWidget {
  final VoidCallback? onNewCard;

  const NewCardPopupContent({super.key, this.onNewCard});

  @override
  Widget build(BuildContext context) {
    final mockSessions = List<String>.generate(
      NewCardPopupLayout.mockSessionCount,
      (index) => 'Mock Session ${index + 1}',
    );

    return RepaintBoundary(
      child: AdaptiveGlass(
        shape: const LiquidRoundedSuperellipse(
          borderRadius: NewCardPopupLayout.borderRadius,
        ),
        settings: InheritedLiquidGlass.ofOrDefault(context),
        quality: GlassQuality.standard,
        useOwnLayer: true,
        clipBehavior: Clip.antiAlias,
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: NewCardPopupLayout.topPadding),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: NewCardPopupLayout.sidePadding,
                ),
                child: _PopupTextActionButton(
                  label: '+ New Card',
                  onTap: onNewCard,
                ),
              ),
              const SizedBox(height: NewCardPopupLayout.buttonDividerSpacing),
              const FractionallySizedBox(
                widthFactor: 0.8,
                child: _PopupDivider(),
              ),
              const SizedBox(height: NewCardPopupLayout.dividerListSpacing),
              for (final sessionName in mockSessions)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: NewCardPopupLayout.sidePadding,
                  ),
                  child: _PopupTextActionButton(
                    label: sessionName,
                    onTap: () {},
                  ),
                ),
              const SizedBox(height: NewCardPopupLayout.bottomPadding),
            ],
          ),
        ),
      ),
    );
  }
}

class _PopupDivider extends StatelessWidget {
  const _PopupDivider();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: NewCardPopupLayout.dividerThickness,
      child: ColoredBox(color: Colors.white24),
    );
  }
}

class _PopupTextActionButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;

  const _PopupTextActionButton({required this.label, this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: NewCardPopupLayout.buttonHeight,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(
            NewCardPopupLayout.buttonBorderRadius,
          ),
          splashColor: Colors.white24,
          highlightColor: Colors.white10,
          child: Center(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
